import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { DomainError } from '../../../shared/domain/domain-error';
import { Clock, CLOCK } from '../../../shared/domain/ports/clock';
import { EVENT_BUS, EventBus } from '../../../shared/domain/ports/event-bus';
import { ID_GENERATOR, IdGenerator } from '../../../shared/domain/ports/id-generator';
import { EnvironmentVariables } from '../../../core/config/env.validation';
import { OrderStatusChangedEvent } from '../../orders/domain/events/order.events';
import { OrdersCoordinationService } from '../../orders/application/orders-coordination.service';
import { ServicePayment } from '../domain/entities/service-payment.entity';
import {
  PAYMENT_PROVIDER,
  PaymentProvider,
} from '../domain/ports/payment-provider.port';
import {
  PayoutRow,
  SERVICE_PAYMENT_REPOSITORY,
  ServicePaymentRepository,
} from '../domain/repositories/service-payment.repository';

export interface PaymentView {
  status: string;
  amount: number;
  currency: string;
  paidAt: Date | null;
}

/** Estados del pedido en los que el buyer puede pagar el servicio. */
const PAYABLE_STATUSES = new Set(['ASSIGNED', 'SOURCING', 'IN_TRANSIT', 'READY_FOR_DELIVERY']);

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(SERVICE_PAYMENT_REPOSITORY) private readonly payments: ServicePaymentRepository,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ordersCoordination: OrdersCoordinationService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  /** Crea (o reusa) el pago del servicio y devuelve la URL de checkout. */
  async createCheckout(
    userId: string,
    orderId: string,
  ): Promise<{ checkoutUrl: string; amount: number; currency: string }> {
    const order = await this.ordersCoordination.getMatchableOrder(orderId);
    // 404 también si no es el dueño: no revelar pedidos ajenos
    if (!order || order.buyerUserId !== userId) {
      throw new DomainError('NOT_FOUND', 'Order not found', 'NOT_FOUND');
    }
    if (!PAYABLE_STATUSES.has(order.status)) {
      throw new DomainError(
        'ORDER_NOT_PAYABLE',
        `Order in status ${order.status} cannot be paid`,
        'CONFLICT',
      );
    }

    let payment = await this.payments.findByOrderId(orderId);
    if (payment?.status === 'PAID') {
      throw new DomainError('ALREADY_PAID', 'Service is already paid', 'CONFLICT');
    }
    if (!payment) {
      // monto congelado: serviceTotal del pricing persistido en el pedido
      const serviceTotal =
        Math.round((order.travelerRewardAmount + order.platformFeeAmount) * 100) / 100;
      payment = ServicePayment.create({
        id: this.ids.next(),
        orderId,
        amount: serviceTotal,
        currency: order.estimatedPriceCurrency,
        provider: this.provider.name,
      });
    }

    const session = await this.provider.createCheckout({
      paymentId: payment.id,
      orderId,
      amount: payment.amount,
      currency: payment.currency,
    });
    payment.attachProviderRef(session.providerRef);
    await this.payments.save(payment);

    return { checkoutUrl: session.checkoutUrl, amount: payment.amount, currency: payment.currency };
  }

  async getPaymentForBuyer(userId: string, orderId: string): Promise<PaymentView | null> {
    const order = await this.ordersCoordination.getMatchableOrder(orderId);
    if (!order || order.buyerUserId !== userId) {
      throw new DomainError('NOT_FOUND', 'Order not found', 'NOT_FOUND');
    }
    const payment = await this.payments.findByOrderId(orderId);
    return payment
      ? {
          status: payment.status,
          amount: payment.amount,
          currency: payment.currency,
          paidAt: payment.paidAt,
        }
      : null;
  }

  /** Webhook del proveedor (público + firma verificada por el adapter). */
  async handleWebhook(
    providerName: string,
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
  ): Promise<void> {
    if (providerName !== this.provider.name) {
      throw new DomainError('NOT_FOUND', 'Unknown payment provider', 'NOT_FOUND');
    }
    const result = this.provider.verifyWebhook(headers, body);
    const payment = await this.payments.findByProviderRef(result.providerRef);
    if (!payment) {
      throw new DomainError('NOT_FOUND', 'Payment not found', 'NOT_FOUND');
    }
    if (payment.status === 'PAID') {
      return; // webhook duplicado: idempotente
    }
    if (result.approved) {
      payment.markPaid(this.clock.now());
    } else {
      payment.markFailed();
    }
    await this.payments.save(payment);
    await this.eventBus.publishAll(payment.pullDomainEvents());
  }

  /** Gate para orders (PAYMENT_STATUS_PORT): ¿el servicio está pagado? */
  async isServicePaid(orderId: string): Promise<boolean> {
    if (!this.config.get('PAYMENTS_REQUIRED', { infer: true })) {
      return true; // pagos desactivados (dev): el gate no aplica
    }
    const payment = await this.payments.findByOrderId(orderId);
    return payment?.status === 'PAID' || payment?.status === 'REFUND_DUE';
  }

  // -------- ciclo de payout/refund, reaccionando al pedido --------

  @OnEvent(OrderStatusChangedEvent.EVENT_NAME, { promisify: true })
  async onOrderStatusChanged(event: OrderStatusChangedEvent): Promise<void> {
    try {
      if (event.payload.to === 'READY_FOR_DELIVERY') {
        // recepción en hub: el trabajo del viajero terminó → payout DUE
        await this.mutatePayment(event.payload.orderId, (p) => p.makePayoutDue());
      }
      if (event.payload.to === 'CANCELLED') {
        await this.mutatePayment(event.payload.orderId, (p) => p.markRefundDue());
      }
    } catch (error) {
      this.logger.warn(
        { orderId: event.payload.orderId, err: (error as Error).message },
        'Payment lifecycle handler failed',
      );
    }
  }

  // -------- operación (admin) --------

  /** Reembolsos pendientes (pedidos cancelados con servicio pagado). */
  async listRefunds(limit: number): Promise<{ paymentId: string; orderId: string; amount: number; currency: string }[]> {
    const rows = await this.payments.listRefundsDue(limit);
    return rows;
  }

  listPayouts(status: 'DUE' | 'PAID_OUT' | undefined, limit: number): Promise<PayoutRow[]> {
    return this.payments.listPayouts(status, limit);
  }

  async markPaidOut(paymentId: string): Promise<void> {
    const payment = await this.requirePayment(paymentId);
    payment.markPaidOut(this.clock.now());
    await this.payments.save(payment);
  }

  async markRefunded(paymentId: string): Promise<void> {
    const payment = await this.requirePayment(paymentId);
    payment.markRefunded(this.clock.now());
    await this.payments.save(payment);
  }

  private async requirePayment(paymentId: string): Promise<ServicePayment> {
    const payment = await this.payments.findById(paymentId);
    if (!payment) {
      throw new DomainError('NOT_FOUND', 'Payment not found', 'NOT_FOUND');
    }
    return payment;
  }

  private async mutatePayment(
    orderId: string,
    action: (payment: ServicePayment) => void,
  ): Promise<void> {
    const payment = await this.payments.findByOrderId(orderId);
    if (!payment) {
      return; // pedido sin pago (PAYMENTS_REQUIRED=false): nada que hacer
    }
    action(payment);
    await this.payments.save(payment);
  }
}
