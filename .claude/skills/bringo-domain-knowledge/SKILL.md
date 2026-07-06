---
name: bringo-domain-knowledge
description: >
  Consulta este skill como fuente única de verdad sobre el negocio de
  Bringo: quién es cada actor, el flujo MVP, la máquina de estados del
  pedido y los tipos de Fulfillment previstos a futuro. Todos los agentes
  deben alinear sus decisiones con este contexto de negocio.
---

# Contexto de negocio — Bringo

## Qué es Bringo

Plataforma logística colaborativa que conecta Buyers (compradores) con
Travelers (viajeros que regresan desde otros países). El sistema asigna
automáticamente el mejor Traveler a cada pedido; el Buyer no elige.

Corredor inicial: Estados Unidos → El Salvador. La arquitectura debe
soportar cualquier corredor país-a-país (España → El Salvador, México →
Guatemala, Canadá → Costa Rica, etc.) sin cambios de código, solo de datos.

## Actores

- **Buyer** — crea pedidos de productos que quiere recibir.
- **Traveler** — publica viajes con capacidad disponible y acepta pedidos
  compatibles.
- **Admin** — supervisa operación, resuelve incidencias, no participa en el
  flujo transaccional normal.

## Flujo MVP (tipo de Fulfillment: BUYER_SHIPS_TO_TRAVELER)

1. Traveler publica un viaje: país origen, país destino, fecha de llegada,
   capacidad disponible.
2. Buyer crea un pedido: producto, URL del producto, precio estimado, país
   de compra, ciudad de entrega.
3. El sistema busca automáticamente un viaje compatible (matching engine).
4. El Traveler acepta el pedido asignado.
5. El Buyer compra el producto; el producto llega a la dirección del
   Traveler.
6. El Traveler recibe el paquete.
7. El Traveler viaja.
8. El Traveler entrega el producto al Buyer.
9. Ambos se califican mutuamente.

## Tipos de Fulfillment previstos a futuro (no implementar todavía)

- `BUYER_SHIPS_TO_TRAVELER` (el flujo MVP actual, con nombre explícito)
- `CUSTOMER_SHIPS_TO_TRAVELER`
- `TRAVELER_PURCHASES_PRODUCT`
- `WAREHOUSE_FULFILLMENT`
- `LOCAL_INVENTORY`

Ninguno de estos debe requerir modificar Order, Trip o Assignment cuando se
agregue; ver skill `ddd-modular-monolith` para el patrón de extensibilidad.

## Máquina de estados del pedido (borrador de referencia, sujeto a revisión
por domain-architect)

```
CREATED
  → WAITING_ASSIGNMENT
WAITING_ASSIGNMENT
  → ASSIGNED (matching encontró un Traveler)
  → CANCELLED (expiró sin match, o Buyer cancela)
ASSIGNED
  → WAITING_PURCHASE (Traveler aceptó)
  → WAITING_ASSIGNMENT (Traveler rechazó / se reasigna)
WAITING_PURCHASE
  → PURCHASED
  → CANCELLED
PURCHASED
  → RECEIVED_BY_TRAVELER
RECEIVED_BY_TRAVELER
  → IN_TRANSIT
IN_TRANSIT
  → READY_FOR_DELIVERY
READY_FOR_DELIVERY
  → DELIVERED
DELIVERED
  → COMPLETED (tras calificaciones de ambas partes)
(cualquier estado previo a PURCHASED)
  → CANCELLED
```

Cada transición debe disparar un evento de dominio (para notificaciones,
auditoría, etc.), nunca ser un simple `UPDATE` silencioso del campo estado.

## Reglas de negocio que deben tratarse como invariantes de dominio

- Un pedido no puede tener dos asignaciones activas simultáneas.
- Un viaje no puede aceptar más pedidos que su capacidad disponible.
- No se puede pasar de `WAITING_ASSIGNMENT` a `DELIVERED` saltando estados.
- La reputación del Traveler influye en el matching pero nunca bloquea por
  sí sola sin un umbral explícito y configurable.
