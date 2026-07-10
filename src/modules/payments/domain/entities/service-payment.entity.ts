import { AggregateRoot } from '../../../../shared/domain/aggregate-root';
import { DomainError } from '../../../../shared/domain/domain-error';
import { PaymentPaidEvent } from '../events/payment.events';

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUND_DUE' | 'REFUNDED';
export type PayoutStatus = 'NOT_DUE' | 'DUE' | 'PAID_OUT';

export interface ServicePaymentProps {
  id: string;
  orderId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider: string;
  providerRef: string | null;
  paidAt: Date | null;
  payoutStatus: PayoutStatus;
  payoutAt: Date | null;
  refundedAt: Date | null;
}

/**
 * Cobro del SERVICIO de un pedido (docs/design/10-pagos.md): ciclo de cobro
 * (PENDING→PAID→[REFUND_DUE→REFUNDED]) + ciclo de payout al viajero
 * (NOT_DUE→DUE→PAID_OUT, liberado en la recepción en hub).
 */
export class ServicePayment extends AggregateRoot {
  private constructor(private readonly props: ServicePaymentProps) {
    super();
  }

  static create(input: {
    id: string;
    orderId: string;
    amount: number;
    currency: string;
    provider: string;
  }): ServicePayment {
    if (input.amount <= 0) {
      throw new DomainError('PAYMENT_AMOUNT_INVALID', 'Amount must be positive', 'UNPROCESSABLE');
    }
    return new ServicePayment({
      ...input,
      status: 'PENDING',
      providerRef: null,
      paidAt: null,
      payoutStatus: 'NOT_DUE',
      payoutAt: null,
      refundedAt: null,
    });
  }

  static restore(props: ServicePaymentProps): ServicePayment {
    return new ServicePayment(props);
  }

  attachProviderRef(ref: string): void {
    this.props.providerRef = ref;
  }

  markPaid(now: Date): void {
    if (this.props.status !== 'PENDING' && this.props.status !== 'FAILED') {
      throw new DomainError(
        'INVALID_STATE_TRANSITION',
        `Cannot mark paid a payment in status ${this.props.status}`,
        'CONFLICT',
      );
    }
    this.props.status = 'PAID';
    this.props.paidAt = now;
    this.record(
      new PaymentPaidEvent(now, {
        paymentId: this.props.id,
        orderId: this.props.orderId,
        amount: this.props.amount,
      }),
    );
  }

  markFailed(): void {
    if (this.props.status !== 'PENDING') {
      return; // webhook tardío sobre un pago ya resuelto: ignorar
    }
    this.props.status = 'FAILED';
  }

  /** Recepción en hub confirmada: el trabajo del viajero terminó. */
  makePayoutDue(): void {
    if (this.props.status === 'PAID' && this.props.payoutStatus === 'NOT_DUE') {
      this.props.payoutStatus = 'DUE';
    }
  }

  markPaidOut(now: Date): void {
    if (this.props.payoutStatus !== 'DUE') {
      throw new DomainError(
        'INVALID_STATE_TRANSITION',
        `Payout is not due (status ${this.props.payoutStatus})`,
        'CONFLICT',
      );
    }
    this.props.payoutStatus = 'PAID_OUT';
    this.props.payoutAt = now;
  }

  /** Pedido cancelado con servicio pagado: hay que devolver el dinero. */
  markRefundDue(): void {
    if (this.props.status !== 'PAID' || this.props.payoutStatus === 'PAID_OUT') {
      return; // sin pago no hay reembolso; con payout ejecutado se resuelve por disputa
    }
    this.props.status = 'REFUND_DUE';
  }

  markRefunded(now: Date): void {
    if (this.props.status !== 'REFUND_DUE') {
      throw new DomainError(
        'INVALID_STATE_TRANSITION',
        `No refund is due (status ${this.props.status})`,
        'CONFLICT',
      );
    }
    this.props.status = 'REFUNDED';
    this.props.refundedAt = now;
  }

  get id(): string {
    return this.props.id;
  }
  get orderId(): string {
    return this.props.orderId;
  }
  get amount(): number {
    return this.props.amount;
  }
  get currency(): string {
    return this.props.currency;
  }
  get status(): PaymentStatus {
    return this.props.status;
  }
  get provider(): string {
    return this.props.provider;
  }
  get providerRef(): string | null {
    return this.props.providerRef;
  }
  get paidAt(): Date | null {
    return this.props.paidAt;
  }
  get payoutStatus(): PayoutStatus {
    return this.props.payoutStatus;
  }
  get payoutAt(): Date | null {
    return this.props.payoutAt;
  }
  get refundedAt(): Date | null {
    return this.props.refundedAt;
  }
}
