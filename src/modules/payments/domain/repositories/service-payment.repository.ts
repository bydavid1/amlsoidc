import { ServicePayment, PayoutStatus } from '../entities/service-payment.entity';

export const SERVICE_PAYMENT_REPOSITORY = Symbol('SERVICE_PAYMENT_REPOSITORY');

export interface PayoutRow {
  paymentId: string;
  orderId: string;
  productName: string;
  travelerFirstName: string | null;
  travelerPhone: string | null;
  rewardAmount: number;
  payoutStatus: PayoutStatus;
  paidAt: Date | null;
  payoutAt: Date | null;
}

export interface ServicePaymentRepository {
  findById(id: string): Promise<ServicePayment | null>;
  findByOrderId(orderId: string): Promise<ServicePayment | null>;
  findByProviderRef(providerRef: string): Promise<ServicePayment | null>;
  save(payment: ServicePayment): Promise<void>;
  /** Cola de payouts para el operador (admin SÍ ve contacto del viajero). */
  listPayouts(status: PayoutStatus | undefined, limit: number): Promise<PayoutRow[]>;
  listRefundsDue(
    limit: number,
  ): Promise<{ paymentId: string; orderId: string; amount: number; currency: string }[]>;
}
