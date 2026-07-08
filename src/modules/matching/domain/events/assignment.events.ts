import { DomainEvent } from '../../../../shared/domain/domain-event';

interface AssignmentIds {
  assignmentId: string;
  orderId: string;
  tripId: string;
  travelerProfileId: string;
  [key: string]: unknown;
}

abstract class AssignmentEvent implements DomainEvent {
  abstract readonly name: string;
  constructor(
    readonly occurredAt: Date,
    readonly payload: AssignmentIds,
  ) {}
}

/** Emitido al reclamar (claim) un encargo. */
export class AssignmentAcceptedEvent extends AssignmentEvent {
  static readonly EVENT_NAME = 'matching.assignment.accepted';
  readonly name = AssignmentAcceptedEvent.EVENT_NAME;
}

export class AssignmentCancelledEvent extends AssignmentEvent {
  static readonly EVENT_NAME = 'matching.assignment.cancelled';
  readonly name = AssignmentCancelledEvent.EVENT_NAME;
}
