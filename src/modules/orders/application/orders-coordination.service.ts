import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK } from '../../../shared/domain/ports/clock';
import { EVENT_BUS, EventBus } from '../../../shared/domain/ports/event-bus';
import { ID_GENERATOR, IdGenerator } from '../../../shared/domain/ports/id-generator';
import { DomainError } from '../../../shared/domain/domain-error';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { Order, OrderStatus } from '../domain/entities/order.entity';
import {
  FulfillmentStrategyResolver,
  MVP_FULFILLMENT_TYPE,
} from '../domain/fulfillment/fulfillment-strategy';
import { ORDER_REPOSITORY, OrderRepository } from '../domain/repositories/order.repository';

/**
 * API publicada de orders para el hub `matching`
 * (docs/design/02-arquitectura.md — OrdersCoordinationApi). Todas las
 * mutaciones pasan por el agregado; llamadas dentro de la UoW del hub se
 * enlistan en su transacción automáticamente.
 */
export interface MatchableOrderView {
  id: string;
  buyerUserId: string;
  originCountryId: string;
  destinationCountryId: string;
  destinationCityId: string;
  productName: string;
  sizeCategory: string;
  estimatedPriceAmount: number;
  estimatedPriceCurrency: string;
  travelerRewardAmount: number;
  platformFeeAmount: number;
  neededBy: Date | null;
  status: OrderStatus;
  createdAt: Date;
}

@Injectable()
export class OrdersCoordinationService {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly strategies: FulfillmentStrategyResolver,
    private readonly prisma: PrismaService,
  ) {}

  async getMatchableOrder(orderId: string): Promise<MatchableOrderView | null> {
    const order = await this.orders.findById(orderId);
    return order ? this.toView(order) : null;
  }

  /** Pedidos pendientes de un corredor, más antiguos primero (fairness). */
  async listPendingByCorridor(
    originCountryId: string,
    destinationCountryId: string,
    limit: number,
  ): Promise<MatchableOrderView[]> {
    const rows = await this.prisma.client.order.findMany({
      where: {
        originCountryId,
        destinationCountryId,
        status: 'PENDING_ASSIGNMENT',
        deletedAt: null,
      },
      include: { buyerProfile: { select: { userId: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      buyerUserId: r.buyerProfile.userId,
      originCountryId: r.originCountryId,
      destinationCountryId: r.destinationCountryId,
      destinationCityId: r.destinationCityId,
      productName: r.productName,
      sizeCategory: r.sizeCategory,
      estimatedPriceAmount: Number(r.estimatedPriceAmount),
      estimatedPriceCurrency: r.estimatedPriceCurrency,
      travelerRewardAmount: Number(r.travelerRewardAmount),
      platformFeeAmount: Number(r.platformFeeAmount),
      neededBy: r.neededBy,
      status: r.status as OrderStatus,
      createdAt: r.createdAt,
    }));
  }

  /** Traveler aceptó: ASSIGNED + nace el Fulfillment (tipo MVP). */
  markAssigned(orderId: string, actor: string): Promise<void> {
    return this.mutate(orderId, (order) => {
      const strategy = this.strategies.resolve(MVP_FULFILLMENT_TYPE);
      order.assign(this.ids.next(), strategy, actor, this.clock.now());
    });
  }

  markReceivedByTraveler(orderId: string, actor: string): Promise<void> {
    return this.mutate(orderId, (order) => {
      const strategy = this.strategies.resolve(this.requireType(order));
      order.markReceivedByTraveler(strategy, actor, this.clock.now());
    });
  }

  markInTransit(orderId: string, actor: string): Promise<void> {
    return this.mutate(orderId, (order) => {
      const strategy = this.strategies.resolve(this.requireType(order));
      order.markInTransit(strategy, actor, this.clock.now());
    });
  }

  /**
   * Modelo hub: la "llegada" del pedido a READY_FOR_DELIVERY la confirma
   * BRINGO al recibir el paquete en el punto (no el traveler).
   */
  confirmHubReception(orderId: string, actor: string): Promise<void> {
    return this.mutate(orderId, (order) => order.markArrived(actor, this.clock.now()));
  }

  /** El traveler registra dónde recibirá el producto (requerido para la compra). */
  setReceivingAddress(orderId: string, addressLine: string): Promise<void> {
    return this.mutate(orderId, (order) => order.setReceivingAddress(addressLine));
  }

  returnToPending(orderId: string, actor: string): Promise<void> {
    return this.mutate(orderId, (order) => order.returnToPending(actor, this.clock.now()));
  }

  expireOrder(orderId: string): Promise<void> {
    return this.mutate(orderId, (order) => order.expire(this.clock.now()));
  }

  /** Ambas partes calificaron: el ciclo cierra (reputation lo invoca). */
  completeOrder(orderId: string, actor: string): Promise<void> {
    return this.mutate(orderId, (order) => order.complete(actor, this.clock.now()));
  }

  /** report-issue (incidents lo invoca). */
  disputeOrder(orderId: string, actor: string): Promise<void> {
    return this.mutate(orderId, (order) => order.markDisputed(actor, this.clock.now()));
  }

  cancelFromDispute(orderId: string, actor: string): Promise<void> {
    return this.mutate(orderId, (order) => order.cancelFromDispute(actor, this.clock.now()));
  }

  async resumeFromDispute(orderId: string, actor: string): Promise<void> {
    const previous = await this.findStateBeforeDispute(orderId);
    return this.mutate(orderId, (order) =>
      order.resumeFromDispute(previous as OrderStatus, actor, this.clock.now()),
    );
  }

  /** Estado del backbone previo a DISPUTED, leído del historial (proyección). */
  private async findStateBeforeDispute(orderId: string): Promise<string> {
    const row = await this.prisma.client.orderStatusHistory.findFirst({
      where: { orderId, toState: 'DISPUTED' },
      orderBy: { occurredAt: 'desc' },
      select: { fromState: true },
    });
    if (!row?.fromState) {
      throw new DomainError('DISPUTE_HISTORY_MISSING', 'No dispute transition found', 'CONFLICT');
    }
    return row.fromState;
  }

  private async mutate(orderId: string, action: (order: Order) => void): Promise<void> {
    const order = await this.orders.findById(orderId);
    if (!order) {
      throw new DomainError('NOT_FOUND', 'Order not found', 'NOT_FOUND');
    }
    action(order);
    await this.orders.save(order);
    await this.eventBus.publishAll(order.pullDomainEvents());
  }

  private requireType(order: Order) {
    const f = order.fulfillment;
    if (!f) {
      throw new DomainError('FULFILLMENT_MISSING', 'Order has no fulfillment yet', 'CONFLICT');
    }
    return f.type;
  }

  private toView(order: Order): MatchableOrderView {
    return {
      id: order.id,
      buyerUserId: order.buyerUserId,
      originCountryId: order.originCountryId,
      destinationCountryId: order.destinationCountryId,
      destinationCityId: order.destinationCityId,
      productName: order.productName,
      sizeCategory: order.sizeCategory,
      estimatedPriceAmount: order.estimatedPriceAmount,
      estimatedPriceCurrency: order.estimatedPriceCurrency,
      travelerRewardAmount: order.travelerRewardAmount,
      platformFeeAmount: order.platformFeeAmount,
      neededBy: order.neededBy,
      status: order.status,
      createdAt: order.createdAt,
    };
  }
}
