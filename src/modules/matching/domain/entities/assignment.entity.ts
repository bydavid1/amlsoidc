import { AggregateRoot } from '../../../../shared/domain/aggregate-root';
import { DomainError } from '../../../../shared/domain/domain-error';
import {
  AssignmentAcceptedEvent,
  AssignmentCancelledEvent,
} from '../events/assignment.events';

/**
 * OFFERED/REJECTED/EXPIRED pertenecen al modelo anterior de ofertas; se
 * conservan en el tipo por el historial en DB, pero ya no se producen
 * (docs/design/09-modelo-claim-y-pricing.md).
 */
export type AssignmentStatus = 'OFFERED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';

export interface AssignmentProps {
  id: string;
  orderId: string;
  tripId: string;
  travelerProfileId: string;
  status: AssignmentStatus;
  scoreBreakdown: Record<string, number> | null;
  offeredAt: Date;
  respondedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

/**
 * Agregado Assignment en el modelo CLAIM: el Traveler reclama un encargo
 * disponible y nace directamente ACCEPTED. La invariante "una sola asignación
 * activa por pedido" la refuerza el índice único parcial en DB (el primer
 * claim gana; el segundo recibe 409).
 */
export class Assignment extends AggregateRoot {
  private constructor(private readonly props: AssignmentProps) {
    super();
  }

  /** El Traveler reclama el encargo para su viaje. */
  static claim(input: {
    id: string;
    orderId: string;
    tripId: string;
    travelerProfileId: string;
    now: Date;
  }): Assignment {
    const assignment = new Assignment({
      id: input.id,
      orderId: input.orderId,
      tripId: input.tripId,
      travelerProfileId: input.travelerProfileId,
      status: 'ACCEPTED',
      scoreBreakdown: null,
      offeredAt: input.now,
      respondedAt: input.now,
      expiresAt: null,
      createdAt: input.now,
    });
    assignment.record(
      new AssignmentAcceptedEvent(input.now, {
        assignmentId: input.id,
        orderId: input.orderId,
        tripId: input.tripId,
        travelerProfileId: input.travelerProfileId,
      }),
    );
    return assignment;
  }

  static restore(props: AssignmentProps): Assignment {
    return new Assignment(props);
  }

  /** Cancelación cruzada (pedido cancelado por el Buyer / viaje cancelado). */
  cancel(now: Date): void {
    if (this.props.status !== 'ACCEPTED' && this.props.status !== 'OFFERED') {
      throw new DomainError(
        'INVALID_STATE_TRANSITION',
        `Cannot cancel an assignment in status ${this.props.status}`,
        'CONFLICT',
      );
    }
    this.props.status = 'CANCELLED';
    this.props.respondedAt = now;
    this.record(
      new AssignmentCancelledEvent(now, {
        assignmentId: this.props.id,
        orderId: this.props.orderId,
        tripId: this.props.tripId,
        travelerProfileId: this.props.travelerProfileId,
      }),
    );
  }

  get id(): string {
    return this.props.id;
  }
  get orderId(): string {
    return this.props.orderId;
  }
  get tripId(): string {
    return this.props.tripId;
  }
  get travelerProfileId(): string {
    return this.props.travelerProfileId;
  }
  get status(): AssignmentStatus {
    return this.props.status;
  }
  get scoreBreakdown(): Record<string, number> | null {
    return this.props.scoreBreakdown;
  }
  get offeredAt(): Date {
    return this.props.offeredAt;
  }
  get respondedAt(): Date | null {
    return this.props.respondedAt;
  }
  get expiresAt(): Date | null {
    return this.props.expiresAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
