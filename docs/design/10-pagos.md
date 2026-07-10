# 10 — Pagos: checkout del servicio + payout manual

> Contexto Payments (la brecha señalada desde el diseño original). Cobra el
> **servicio** (`serviceTotal = travelerReward + platformFee`, ya persistidos):
> el producto lo compra el buyer directo en la tienda. Modelo hub (doc 11):
> el payout del viajero se libera al entregar en el hub.

## 1. Agregado `ServicePayment` (módulo `payments`)

Uno por pedido (`orderId @unique`). Dos ciclos independientes:

```
Cobro:   PENDING ──webhook──► PAID ──(order CANCELLED)──► REFUND_DUE ──admin──► REFUNDED
                └──webhook──► FAILED (reintentable → PENDING vía nuevo checkout)
Payout:  NOT_DUE ──(hub reception: order → READY_FOR_DELIVERY)──► DUE ──admin──► PAID_OUT
```

- El monto se congela al crear el pago (igual que el pricing del pedido).
- Payout manual en el piloto: el operador paga al viajero (efectivo/transferencia)
  y lo marca en el panel. Automatizarlo = fase futura.

## 2. Puerto de proveedor (no casarse con la pasarela)

```ts
PaymentProvider {
  createCheckout({paymentId, orderId, amount, currency}) → { checkoutUrl, providerRef }
  verifyWebhook(headers, body) → { providerRef, approved }   // lanza si firma inválida
}
```

- **`SandboxPaymentProvider`** (dev/pilotos sin cuenta bancaria): el checkout
  es una página del frontend con "Aprobar/Rechazar" que dispara el webhook
  firmado con `PAYMENTS_SANDBOX_SECRET`. Todo el flujo E2E funciona hoy.
- **Adapter real** (Wompi SV / n1co / Pagadito): se implementa contra su
  sandbox cuando existan credenciales; swap por config `PAYMENTS_PROVIDER`,
  el resto del sistema no cambia.

## 3. Gate de negocio

`confirm-purchase` exige servicio **PAID** (`PAYMENT_REQUIRED`, 409) — el buyer
paga a Bringo antes de comprar el producto. Flag `PAYMENTS_REQUIRED=false`
para desactivar en dev. Puerto invertido `PAYMENT_STATUS_PORT` definido en
orders, implementado por payments (patrón de los ports de cancelación).

## 4. API

| Endpoint | Actor | Nota |
|---|---|---|
| `POST /orders/:id/payment/checkout` | Buyer (dueño) | crea/reusa el pago y devuelve `checkoutUrl` |
| `GET /orders/:id/payment` | Buyer (dueño) | estado + monto (el split viajero/Bringo sigue oculto) |
| `POST /payments/webhook/:provider` | Público + firma | confirma PAID/FAILED |
| `GET /admin/payouts?status=DUE` | Admin | cola de pagos al viajero (con nombre y teléfono — admin sí ve contacto) |
| `POST /admin/payouts/:paymentId/mark-paid` | Admin | payout ejecutado |
| `POST /admin/payments/:paymentId/mark-refunded` | Admin | reembolso ejecutado |

Eventos: `payments.payment.paid` → notificaciones (buyer: "pago recibido";
traveler: "el servicio de tu encargo ya está pagado" — señal de confianza).

## 5. Config

`PAYMENTS_REQUIRED=true` · `PAYMENTS_PROVIDER=sandbox` ·
`PAYMENTS_SANDBOX_SECRET` · `FRONTEND_URL` (retorno del checkout).
