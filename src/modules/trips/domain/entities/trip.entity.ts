import { AggregateRoot } from '../../../../shared/domain/aggregate-root';
import { DomainError } from '../../../../shared/domain/domain-error';
import { TripCancelledEvent, TripPublishedEvent } from '../events/trip.events';

export type TripStatus = 'DRAFT' | 'OPEN' | 'IN_PROGRESS' | 'CLOSED' | 'CANCELLED';

export interface TripProps {
  id: string;
  travelerProfileId: string;
  originCountryId: string;
  destinationCountryId: string;
  destinationCityId: string | null;
  arrivalDate: Date;
  totalCapacity: number;
  remainingCapacity: number;
  status: TripStatus;
}

/**
 * Agregado Trip. Invariantes: capacidad > 0; nunca se reserva por encima de
 * remainingCapacity; solo un Trip OPEN acepta carga (docs/design/01-dominio.md).
 * La reserva de capacidad se refuerza además con decremento atómico en DB.
 */
export class Trip extends AggregateRoot {
  private constructor(private readonly props: TripProps) {
    super();
  }

  static create(input: {
    id: string;
    travelerProfileId: string;
    originCountryId: string;
    destinationCountryId: string;
    destinationCityId: string | null;
    arrivalDate: Date;
    capacity: number;
    now: Date;
  }): Trip {
    if (!Number.isInteger(input.capacity) || input.capacity < 1) {
      throw new DomainError('TRIP_CAPACITY_INVALID', 'Capacity must be >= 1', 'UNPROCESSABLE');
    }
    if (input.arrivalDate.getTime() <= input.now.getTime()) {
      throw new DomainError(
        'TRIP_ARRIVAL_IN_PAST',
        'Arrival date must be in the future',
        'UNPROCESSABLE',
      );
    }
    return new Trip({
      id: input.id,
      travelerProfileId: input.travelerProfileId,
      originCountryId: input.originCountryId,
      destinationCountryId: input.destinationCountryId,
      destinationCityId: input.destinationCityId,
      arrivalDate: input.arrivalDate,
      totalCapacity: input.capacity,
      remainingCapacity: input.capacity,
      status: 'DRAFT',
    });
  }

  static restore(props: TripProps): Trip {
    return new Trip(props);
  }

  publish(now: Date): void {
    if (this.props.status !== 'DRAFT') {
      throw new DomainError(
        'INVALID_STATE_TRANSITION',
        `Cannot publish a trip in status ${this.props.status}`,
        'CONFLICT',
      );
    }
    this.props.status = 'OPEN';
    this.record(
      new TripPublishedEvent(now, {
        tripId: this.props.id,
        travelerProfileId: this.props.travelerProfileId,
        originCountryId: this.props.originCountryId,
        destinationCountryId: this.props.destinationCountryId,
        arrivalDate: this.props.arrivalDate.toISOString(),
      }),
    );
  }

  cancel(now: Date): void {
    if (this.props.status !== 'DRAFT' && this.props.status !== 'OPEN') {
      throw new DomainError(
        'INVALID_STATE_TRANSITION',
        `Cannot cancel a trip in status ${this.props.status}`,
        'CONFLICT',
      );
    }
    this.props.status = 'CANCELLED';
    this.record(new TripCancelledEvent(now, { tripId: this.props.id }));
  }

  get id(): string {
    return this.props.id;
  }
  get travelerProfileId(): string {
    return this.props.travelerProfileId;
  }
  get originCountryId(): string {
    return this.props.originCountryId;
  }
  get destinationCountryId(): string {
    return this.props.destinationCountryId;
  }
  get destinationCityId(): string | null {
    return this.props.destinationCityId;
  }
  get arrivalDate(): Date {
    return this.props.arrivalDate;
  }
  get totalCapacity(): number {
    return this.props.totalCapacity;
  }
  get remainingCapacity(): number {
    return this.props.remainingCapacity;
  }
  get status(): TripStatus {
    return this.props.status;
  }
}
