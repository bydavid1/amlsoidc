export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface CheckoutSession {
  checkoutUrl: string;
  providerRef: string;
}

export interface WebhookResult {
  providerRef: string;
  approved: boolean;
}

/**
 * Puerto del proveedor de pagos (docs/design/10-pagos.md §2): sandbox hoy,
 * pasarela real (Wompi/n1co/Pagadito) cuando existan credenciales — el swap
 * es por config, el resto del sistema no cambia.
 */
export interface PaymentProvider {
  readonly name: string;
  createCheckout(input: {
    paymentId: string;
    orderId: string;
    amount: number;
    currency: string;
  }): Promise<CheckoutSession>;
  /** Lanza DomainError si la firma no es válida. */
  verifyWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
  ): WebhookResult;
}
