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

export class AssignmentOfferedEvent extends AssignmentEvent {
  static readonly EVENT_NAME = 'matching.assignment.offered';
  readonly name = AssignmentOfferedEvent.EVENT_NAME;
}

export class AssignmentAcceptedEvent extends AssignmentEvent {
  static readonly EVENT_NAME = 'matching.assignment.accepted';
  readonly name = AssignmentAcceptedEvent.EVENT_NAME;
}

export class AssignmentRejectedEvent extends AssignmentEvent {
  static readonly EVENT_NAME = 'matching.assignment.rejected';
  readonly name = AssignmentRejectedEvent.EVENT_NAME;
}

export class AssignmentExpiredEvent extends AssignmentEvent {
  static readonly EVENT_NAME = 'matching.assignment.expired';
  readonly name = AssignmentExpiredEvent.EVENT_NAME;
}

export class AssignmentCancelledEvent extends AssignmentEvent {
  static readonly EVENT_NAME = 'matching.assignment.cancelled';
  readonly name = AssignmentCancelledEvent.EVENT_NAME;
}
