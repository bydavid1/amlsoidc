import { DomainEvent } from '../../../../shared/domain/domain-event';

export class OrderCreatedEvent implements DomainEvent {
  static readonly EVENT_NAME = 'orders.order.created';
  readonly name = OrderCreatedEvent.EVENT_NAME;

  constructor(
    readonly occurredAt: Date,
    readonly payload: {
      orderId: string;
      originCountryId: string;
      destinationCountryId: string;
    },
  ) {}
}

/** Toda transición (de cualquiera de los dos niveles) emite este evento. */
export class OrderStatusChangedEvent implements DomainEvent {
  static readonly EVENT_NAME = 'orders.order.status_changed';
  readonly name = OrderStatusChangedEvent.EVENT_NAME;

  constructor(
    readonly occurredAt: Date,
    readonly payload: {
      orderId: string;
      from: string | null;
      to: string;
      actor: string;
    },
  ) {}
}
