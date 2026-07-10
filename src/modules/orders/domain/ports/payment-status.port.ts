/**
 * Puerto INVERTIDO (DIP): orders lo define, payments lo implementa
 * (docs/design/10-pagos.md §3). confirm-purchase exige el servicio pagado.
 */
export const PAYMENT_STATUS_PORT = Symbol('PAYMENT_STATUS_PORT');

export interface PaymentStatusPort {
  isServicePaid(orderId: string): Promise<boolean>;
}
