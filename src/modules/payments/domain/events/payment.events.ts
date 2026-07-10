import { DomainEvent } from '../../../../shared/domain/domain-event';

export class PaymentPaidEvent implements DomainEvent {
  static readonly EVENT_NAME = 'payments.payment.paid';
  readonly name = PaymentPaidEvent.EVENT_NAME;

  constructor(
    readonly occurredAt: Date,
    readonly payload: { paymentId: string; orderId: string; amount: number },
  ) {}
}
