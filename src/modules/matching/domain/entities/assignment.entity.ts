import { AggregateRoot } from '../../../../shared/domain/aggregate-root';
import { DomainError } from '../../../../shared/domain/domain-error';
import {
  AssignmentAcceptedEvent,
  AssignmentCancelledEvent,
  AssignmentExpiredEvent,
  AssignmentOfferedEvent,
  AssignmentRejectedEvent,
} from '../events/assignment.events';

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
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Agregado Assignment: resultado del matching con ciclo
 * OFFERED → ACCEPTED | REJECTED | EXPIRED | CANCELLED
 * (docs/design/06-matching.md §4). La invariante "una sola asignación activa
 * por pedido" se refuerza además con índice único parcial en DB.
 */
export class Assignment extends AggregateRoot {
  private constructor(private readonly props: AssignmentProps) {
    super();
  }

  static offer(input: {
    id: string;
    orderId: string;
    tripId: string;
    travelerProfileId: string;
    scoreBreakdown: Record<string, number>;
    now: Date;
    expiresAt: Date;
  }): Assignment {
    const assignment = new Assignment({
      id: input.id,
      orderId: input.orderId,
      tripId: input.tripId,
      travelerProfileId: input.travelerProfileId,
      status: 'OFFERED',
      scoreBreakdown: input.scoreBreakdown,
      offeredAt: input.now,
      respondedAt: null,
      expiresAt: input.expiresAt,
      createdAt: input.now,
    });
    assignment.record(
      new AssignmentOfferedEvent(input.now, {
        assignmentId: input.id,
        orderId: input.orderId,
        tripId: input.tripId,
        travelerProfileId: input.travelerProfileId,
        expiresAt: input.expiresAt.toISOString(),
      }),
    );
    return assignment;
  }

  static restore(props: AssignmentProps): Assignment {
    return new Assignment(props);
  }

  isExpired(now: Date): boolean {
    return this.props.status === 'OFFERED' && this.props.expiresAt.getTime() < now.getTime();
  }

  accept(now: Date): void {
    this.requireOffered('accept');
    if (this.isExpired(now)) {
      throw new DomainError('ASSIGNMENT_EXPIRED', 'The offer has expired', 'CONFLICT');
    }
    this.props.status = 'ACCEPTED';
    this.props.respondedAt = now;
    this.record(new AssignmentAcceptedEvent(now, this.ids()));
  }

  reject(now: Date): void {
    this.requireOffered('reject');
    this.props.status = 'REJECTED';
    this.props.respondedAt = now;
    this.record(new AssignmentRejectedEvent(now, this.ids()));
  }

  expire(now: Date): void {
    this.requireOffered('expire');
    this.props.status = 'EXPIRED';
    this.props.respondedAt = now;
    this.record(new AssignmentExpiredEvent(now, this.ids()));
  }

  cancel(now: Date): void {
    if (this.props.status !== 'OFFERED' && this.props.status !== 'ACCEPTED') {
      throw new DomainError(
        'INVALID_STATE_TRANSITION',
        `Cannot cancel an assignment in status ${this.props.status}`,
        'CONFLICT',
      );
    }
    this.props.status = 'CANCELLED';
    this.props.respondedAt = now;
    this.record(new AssignmentCancelledEvent(now, this.ids()));
  }

  private requireOffered(action: string): void {
    if (this.props.status !== 'OFFERED') {
      throw new DomainError(
        'INVALID_STATE_TRANSITION',
        `Cannot ${action} an assignment in status ${this.props.status}`,
        'CONFLICT',
      );
    }
  }

  private ids(): { assignmentId: string; orderId: string; tripId: string; travelerProfileId: string } {
    return {
      assignmentId: this.props.id,
      orderId: this.props.orderId,
      tripId: this.props.tripId,
      travelerProfileId: this.props.travelerProfileId,
    };
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
  get expiresAt(): Date {
    return this.props.expiresAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
