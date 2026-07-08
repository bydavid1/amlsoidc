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
  status: TripStatus;
}

/**
 * Agregado Trip: solo ruta + fecha (docs/design/09-modelo-claim-y-pricing.md).
 * La capacidad numérica desapareció del modelo: "si cabe o no" lo juzga el
 * viajero encargo por encargo al reclamar.
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
    now: Date;
  }): Trip {
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
  get status(): TripStatus {
    return this.props.status;
  }
}
