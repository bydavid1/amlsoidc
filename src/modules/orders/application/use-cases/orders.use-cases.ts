import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../../../shared/domain/domain-error';
import { Clock, CLOCK } from '../../../../shared/domain/ports/clock';
import { EVENT_BUS, EventBus } from '../../../../shared/domain/ports/event-bus';
import { ID_GENERATOR, IdGenerator } from '../../../../shared/domain/ports/id-generator';
import { UNIT_OF_WORK, UnitOfWork } from '../../../../shared/domain/ports/unit-of-work';
import { CursorRef } from '../../../../shared/http/cursor-pagination';
import {
  GEOGRAPHY_REPOSITORY,
  GeographyRepository,
} from '../../../geography/domain/repositories/geography.repository';
import {
  CORRIDOR_POLICY,
  CorridorPolicy,
} from '../../../geography/domain/services/corridor-policy';
import { IdentityAccessService } from '../../../identity/application/identity-access.service';
import { Order, OrderStatus } from '../../domain/entities/order.entity';
import { FulfillmentStrategyResolver } from '../../domain/fulfillment/fulfillment-strategy';
import {
  PRICING_CONFIG,
  PricingConfig,
  quotePricing,
  SizeCategory,
} from '../../domain/services/pricing-policy';
import {
  ORDER_ASSIGNMENTS_PORT,
  OrderAssignmentsPort,
} from '../../domain/ports/order-assignments.port';
import {
  BUYER_PROFILE_REPOSITORY,
  BuyerProfileRepository,
  BuyerProfileView,
} from '../../domain/repositories/buyer-profile.repository';
import {
  ORDER_REPOSITORY,
  OrderListRow,
  OrderRepository,
  StatusHistoryRow,
} from '../../domain/repositories/order.repository';

@Injectable()
export class ActivateBuyerProfileUseCase {
  constructor(
    @Inject(BUYER_PROFILE_REPOSITORY) private readonly profiles: BuyerProfileRepository,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    private readonly identityAccess: IdentityAccessService,
  ) {}

  execute(userId: string): Promise<BuyerProfileView> {
    return this.uow.execute(async () => {
      const existing = await this.profiles.findByUserId(userId);
      if (existing) {
        return existing;
      }
      const profile = await this.profiles.create({ id: this.ids.next(), userId });
      await this.identityAccess.grantRole(userId, 'BUYER');
      return profile;
    });
  }
}

export interface CreateOrderCommand {
  userId: string;
  originCountryId: string;
  destinationCountryId: string;
  destinationCityId: string;
  productName: string;
  productUrl: string;
  estimatedPriceAmount: number;
  estimatedPriceCurrency: string;
  sizeCategory: SizeCategory;
  neededBy: Date | null;
}

@Injectable()
export class CreateOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(BUYER_PROFILE_REPOSITORY) private readonly profiles: BuyerProfileRepository,
    @Inject(CORRIDOR_POLICY) private readonly corridors: CorridorPolicy,
    @Inject(GEOGRAPHY_REPOSITORY) private readonly geography: GeographyRepository,
    @Inject(PRICING_CONFIG) private readonly pricing: PricingConfig,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: CreateOrderCommand): Promise<Order> {
    const profile = await this.profiles.findByUserId(command.userId);
    if (!profile) {
      throw new DomainError(
        'BUYER_PROFILE_REQUIRED',
        'Activate your buyer profile first',
        'FORBIDDEN',
      );
    }

    const enabled = await this.corridors.isEnabled(
      command.originCountryId,
      command.destinationCountryId,
    );
    if (!enabled) {
      throw new DomainError(
        'CORRIDOR_NOT_ENABLED',
        'This corridor is not enabled yet',
        'UNPROCESSABLE',
      );
    }

    const city = await this.geography.findCityById(command.destinationCityId);
    if (!city || city.countryId !== command.destinationCountryId) {
      throw new DomainError(
        'CITY_NOT_IN_DESTINATION_COUNTRY',
        'Delivery city does not belong to the destination country',
        'UNPROCESSABLE',
      );
    }

    const now = this.clock.now();
    // pricing calculado a la creación y persistido (config posterior no lo altera)
    const quote = quotePricing(
      command.estimatedPriceAmount,
      command.sizeCategory,
      this.pricing,
    );
    const order = Order.create({
      id: this.ids.next(),
      buyerProfileId: profile.id,
      buyerUserId: command.userId,
      originCountryId: command.originCountryId,
      destinationCountryId: command.destinationCountryId,
      destinationCityId: command.destinationCityId,
      productName: command.productName,
      productUrl: command.productUrl,
      estimatedPriceAmount: command.estimatedPriceAmount,
      estimatedPriceCurrency: command.estimatedPriceCurrency,
      sizeCategory: command.sizeCategory,
      travelerRewardAmount: quote.travelerReward,
      platformFeeAmount: quote.platformFee,
      neededBy: command.neededBy,
      createdAt: now,
      now,
    });
    await this.orders.save(order);
    // OrderCreated dispara el matching automático
    await this.eventBus.publishAll(order.pullDomainEvents());
    return order;
  }
}

@Injectable()
export class ConfirmPurchaseUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly strategies: FulfillmentStrategyResolver,
  ) {}

  async execute(userId: string, orderId: string): Promise<Order> {
    const order = await loadOwnedOrder(this.orders, userId, orderId);
    const f = order.fulfillment;
    if (!f) {
      throw new DomainError('FULFILLMENT_MISSING', 'Order has no fulfillment yet', 'CONFLICT');
    }
    order.confirmPurchase(this.strategies.resolve(f.type), `buyer:${userId}`, this.clock.now());
    await this.orders.save(order);
    await this.eventBus.publishAll(order.pullDomainEvents());
    return order;
  }
}

@Injectable()
export class ConfirmDeliveryUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** La entrega la confirma el BUYER (decisión de dominio propagada a la API). */
  async execute(userId: string, orderId: string): Promise<Order> {
    const order = await loadOwnedOrder(this.orders, userId, orderId);
    order.confirmDelivered(`buyer:${userId}`, this.clock.now());
    await this.orders.save(order);
    await this.eventBus.publishAll(order.pullDomainEvents());
    return order;
  }
}

@Injectable()
export class CancelOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(ORDER_ASSIGNMENTS_PORT) private readonly assignments: OrderAssignmentsPort,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Cancela pedido + assignment activo + libera capacidad en UNA transacción. */
  async execute(userId: string, orderId: string): Promise<Order> {
    const order = await this.uow.execute(async () => {
      const loaded = await loadOwnedOrder(this.orders, userId, orderId);
      const { hadActiveAssignment } = loaded.cancel(`buyer:${userId}`, this.clock.now());
      await this.orders.save(loaded);
      if (hadActiveAssignment) {
        await this.assignments.cancelActiveAssignmentForOrder(orderId);
      }
      return loaded;
    });
    await this.eventBus.publishAll(order.pullDomainEvents());
    return order;
  }
}

@Injectable()
export class ListMyOrdersUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(BUYER_PROFILE_REPOSITORY) private readonly profiles: BuyerProfileRepository,
  ) {}

  async execute(
    userId: string,
    limit: number,
    cursor: CursorRef | null,
    status?: OrderStatus,
  ): Promise<OrderListRow[]> {
    const profile = await this.profiles.findByUserId(userId);
    if (!profile) {
      return [];
    }
    return this.orders.listByBuyer(profile.id, limit, cursor, status);
  }
}

@Injectable()
export class GetMyOrderUseCase {
  constructor(@Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository) {}

  async execute(
    userId: string,
    orderId: string,
  ): Promise<{ order: Order; timeline: StatusHistoryRow[] }> {
    const order = await loadOwnedOrder(this.orders, userId, orderId);
    const timeline = await this.orders.getStatusHistory(orderId);
    return { order, timeline };
  }
}

async function loadOwnedOrder(
  orders: OrderRepository,
  userId: string,
  orderId: string,
): Promise<Order> {
  const order = await orders.findById(orderId);
  // 404 también cuando no es el dueño: no revelar existencia de recursos ajenos
  if (!order || order.buyerUserId !== userId) {
    throw new DomainError('NOT_FOUND', 'Order not found', 'NOT_FOUND');
  }
  return order;
}
