import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainError } from '../../../../shared/domain/domain-error';
import { EnvironmentVariables } from '../../../../core/config/env.validation';
import {
  CheckoutSession,
  PaymentProvider,
  WebhookResult,
} from '../../domain/ports/payment-provider.port';

interface SandboxWebhookBody {
  providerRef?: string;
  approved?: boolean;
}

/**
 * Proveedor SANDBOX (docs/design/10-pagos.md §2): el "checkout" es una página
 * del frontend con Aprobar/Rechazar que dispara el webhook firmado con el
 * secreto compartido. Permite operar el flujo completo sin cuenta bancaria;
 * la pasarela real se enchufa por config sin tocar el resto.
 */
@Injectable()
export class SandboxPaymentProvider implements PaymentProvider {
  readonly name = 'sandbox';

  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {}

  async createCheckout(input: {
    paymentId: string;
    orderId: string;
    amount: number;
    currency: string;
  }): Promise<CheckoutSession> {
    const providerRef = `sbx_${input.paymentId}`;
    const base = this.config.get('FRONTEND_URL', { infer: true });
    const params = new URLSearchParams({
      ref: providerRef,
      amount: input.amount.toFixed(2),
      currency: input.currency,
    });
    return {
      providerRef,
      checkoutUrl: `${base}/comprar/${input.orderId}/pago-sandbox?${params.toString()}`,
    };
  }

  verifyWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
  ): WebhookResult {
    const signature = headers['x-sandbox-signature'];
    const secret = this.config.get('PAYMENTS_SANDBOX_SECRET', { infer: true });
    if (signature !== secret) {
      throw new DomainError('WEBHOOK_SIGNATURE_INVALID', 'Invalid webhook signature', 'FORBIDDEN');
    }
    const payload = body as SandboxWebhookBody;
    if (!payload?.providerRef || typeof payload.approved !== 'boolean') {
      throw new DomainError('WEBHOOK_PAYLOAD_INVALID', 'Invalid webhook payload', 'UNPROCESSABLE');
    }
    return { providerRef: payload.providerRef, approved: payload.approved };
  }
}
