import { DomainEvent } from '../../../../shared/domain/domain-event';

export class UserRegisteredEvent implements DomainEvent {
  static readonly EVENT_NAME = 'identity.user.registered';
  readonly name = UserRegisteredEvent.EVENT_NAME;

  constructor(
    readonly occurredAt: Date,
    readonly payload: { userId: string; email: string },
  ) {}
}
