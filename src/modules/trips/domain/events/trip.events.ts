import { DomainEvent } from '../../../../shared/domain/domain-event';

export class TripPublishedEvent implements DomainEvent {
  static readonly EVENT_NAME = 'trips.trip.published';
  readonly name = TripPublishedEvent.EVENT_NAME;

  constructor(
    readonly occurredAt: Date,
    readonly payload: {
      tripId: string;
      travelerProfileId: string;
      originCountryId: string;
      destinationCountryId: string;
      arrivalDate: string;
    },
  ) {}
}

export class TripClosedEvent implements DomainEvent {
  static readonly EVENT_NAME = 'trips.trip.closed';
  readonly name = TripClosedEvent.EVENT_NAME;

  constructor(
    readonly occurredAt: Date,
    readonly payload: { tripId: string },
  ) {}
}

export class TripCancelledEvent implements DomainEvent {
  static readonly EVENT_NAME = 'trips.trip.cancelled';
  readonly name = TripCancelledEvent.EVENT_NAME;

  constructor(
    readonly occurredAt: Date,
    readonly payload: { tripId: string },
  ) {}
}
