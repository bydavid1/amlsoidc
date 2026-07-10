import { Injectable } from '@nestjs/common';
import { PaymentStatusPort } from '../../orders/domain/ports/payment-status.port';
import { PaymentsService } from './payments.service';

/** Implementación del puerto invertido que orders usa como gate de compra. */
@Injectable()
export class PaymentsStatusAdapter implements PaymentStatusPort {
  constructor(private readonly payments: PaymentsService) {}

  isServicePaid(orderId: string): Promise<boolean> {
    return this.payments.isServicePaid(orderId);
  }
}
