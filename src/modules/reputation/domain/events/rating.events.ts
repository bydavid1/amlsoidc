import { DomainEvent } from '../../../../shared/domain/domain-event';

export class RatingCreatedEvent implements DomainEvent {
  static readonly EVENT_NAME = 'reputation.rating.created';
  readonly name = RatingCreatedEvent.EVENT_NAME;

  constructor(
    readonly occurredAt: Date,
    readonly payload: {
      orderId: string;
      raterUserId: string;
      rateeUserId: string;
      score: number;
    },
  ) {}
}

/**
 * Snapshot recalculado por reputation (dueño de la tabla de ratings).
 * trips lo escucha POR NOMBRE (sin import del módulo) y actualiza el cache
 * en TravelerProfile — dependencia solo por evento (docs/design/02).
 */
export class ReputationUpdatedEvent implements DomainEvent {
  static readonly EVENT_NAME = 'reputation.updated';
  readonly name = ReputationUpdatedEvent.EVENT_NAME;

  constructor(
    readonly occurredAt: Date,
    readonly payload: { userId: string; average: number; count: number },
  ) {}
}
