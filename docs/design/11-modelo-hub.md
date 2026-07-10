# 11 — Modelo HUB: Bringo como intermediario operativo

> Pivote de negocio (2026-07-09) sobre el modelo claim de `09-modelo-claim-y-pricing.md`.
> Los viajeros son **"trabajadores temporales" de Bringo**: sin contacto directo
> con el comprador, sin chat. Bringo coordina, recibe y entrega.

## 1. Principios

1. **Sin contacto buyer↔traveler** (sin chat): evita la fuga de clientes fuera
   de la plataforma y concentra el soporte en Bringo. Único canal: botón
   "Ayuda de Bringo" (WhatsApp de soporte).
2. **Percepción estilo Uber sin contacto**: el buyer ve *"Carlos ★4.9 lleva tu
   pedido"* (solo nombre de pila + reputación) y las notificaciones narran con
   su nombre ("Carlos ya tiene tu paquete", "Carlos va en camino"). El viajero
   es el protagonista del relato aunque la operación la confirme Bringo.
3. **Bringo hace la última milla**: el viajero entrega en el punto Bringo del
   destino; Bringo entrega al comprador.

## 2. Flujo físico

```
Buyer compra el producto → lo envía a la DIRECCIÓN DE RECEPCIÓN del viajero
  (mostrada ANÓNIMA: solo la dirección, jamás nombre completo/teléfono)
Viajero recibe → viaja → ENTREGA EN EL PUNTO BRINGO
  → un operador (rol ADMIN) confirma la recepción [solo Bringo confirma]
  → payout del viajero queda liberado AQUÍ (su trabajo terminó)
Bringo entrega al buyer → buyer confirma → buyer califica su EXPERIENCIA
  → COMPLETED
```

Mapa sobre la máquina de estados existente (sin enums nuevos):
- `IN_TRANSIT → READY_FOR_DELIVERY` = recepción en hub, la ejecuta
  `POST /admin/orders/:id/confirm-hub-reception` (actor `admin:*`). La acción
  del traveler `mark-arrived` se eliminó.
- `READY_FOR_DELIVERY` se relabela "En poder de Bringo".

## 3. Datos y gates

- **Perfil mínimo obligatorio** (`users.firstName`, `users.phone`): Bringo debe
  poder contactar a ambos actores. `PROFILE_INCOMPLETE` bloquea crear pedidos
  y publicar viajes. `PATCH /users/me`.
- **Dirección de recepción** (`fulfillment_buyer_ships_details.travelerAddressLine`):
  la registra el traveler por encargo (`POST /assignments/:id/set-receiving-address`).
  Sin ella, `confirm-purchase` responde `RECEIVING_ADDRESS_MISSING`. Timestamps
  `purchasedAt` / `receivedByTravelerAt` se sellan en las transiciones.

## 4. Calificaciones

- **El buyer califica su EXPERIENCIA** (una sola calificación completa el
  pedido: `DELIVERED → COMPLETED`). Internamente alimenta la reputación del
  traveler. El path traveler→buyer se eliminó (no se conocen).
- **El operador puntúa al traveler** al confirmar la recepción en hub
  (`travelerScore` opcional: puntualidad, estado del paquete) — alimenta la
  misma reputación que gobierna la percepción pública.

## 5. Visibilidades (acumulado con doc 09)

| Dato | Buyer | Traveler | Admin/Operador |
|---|---|---|---|
| Nombre de pila + reputación del traveler | ✅ | — | ✅ |
| Teléfono/nombre completo de la contraparte | ❌ | ❌ | ✅ |
| Dirección de recepción | ✅ (anónima) | ✅ (propia) | ✅ |
| Total aproximado | ✅ | ❌ | ✅ |
| Ganancia del viajero | ❌ | ✅ (propia) | ✅ |
| Comisión Bringo | ❌ | ❌ | ✅ |

## 6. Backlog relacionado

Mensajes predefinidos relevados por Bringo (si algún día falta comunicación —
nunca chat libre), marcar DELIVERED por operador si el buyer no confirma,
payout automático.
