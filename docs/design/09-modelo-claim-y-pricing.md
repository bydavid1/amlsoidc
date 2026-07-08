# 09 — Cambio de modelo: descubrimiento + claim, y pricing del viajero

> Revisión de negocio (2026-07-08) que **reemplaza** el motor de asignación
> automática de `06-matching.md`. Ese documento queda como referencia
> histórica del diseño anterior.

## 1. Qué cambia y por qué

| Antes (06-matching) | Ahora |
|---|---|
| El Traveler declara **capacidad numérica** del viaje | El viaje es solo **ruta + fecha**. "Si cabe o no" lo juzga el viajero encargo por encargo (un teléfono ≠ una consola). |
| El sistema **empuja una oferta 1-a-1** al mejor Traveler (scoring) | El Traveler **explora los encargos disponibles** compatibles con su viaje y **reclama (claim)** los que decide llevar. |
| Ventana de aceptación + expiración + reintentos | Sin ofertas ni expiración: el claim es directo y atómico. |
| Reserva/liberación de capacidad | Desaparece el concepto de capacidad. |

**Invariantes que se conservan:**
- El Buyer **sigue sin elegir viajero** (elige el viajero al pedido, nunca al revés).
- **Un pedido = una asignación activa** (el índice único parcial en DB resuelve la carrera de dos travelers reclamando el mismo pedido: el primero gana, el segundo recibe 409).
- La máquina de estados del pedido (dos niveles) **no cambia**: claim ⇒ `PENDING_ASSIGNMENT → ASSIGNED` + nace el Fulfillment.
- Puertos invertidos de cancelación intactos (cancelar Trip devuelve pedidos a `PENDING_ASSIGNMENT`).

## 2. Nuevo flujo del Traveler

1. Publica viaje (ruta + fecha de llegada). Sin capacidad.
2. `GET /trips/:id/available-orders` — pedidos `PENDING_ASSIGNMENT` del mismo
   corredor, con llegada compatible (`arrivalDate <= neededBy` si existe),
   excluyendo sus propios pedidos como Buyer. Cada fila muestra producto,
   **tamaño**, valor estimado y **ganancia**.
3. `POST /trips/:tripId/claim/:orderId` — reclama el encargo: transacción única
   crea `Assignment (ACCEPTED)` + `Order → ASSIGNED`. Si otro ganó la carrera →
   `409 ORDER_ALREADY_TAKEN`.
4. El flujo de entrega no cambia (received → in-transit → arrived → delivery
   por el Buyer → ratings → COMPLETED).

El módulo `matching` pasa a ser **discovery + claim** (conserva el nombre).
Se eliminan: scoring, triggers por eventos, barrido de expiración, estados
`OFFERED/REJECTED/EXPIRED` (quedan en el enum de DB por historial, pero ya no
se producen).

## 3. Tamaño del encargo (nuevo dato del pedido)

El Buyer declara `sizeCategory` al crear el pedido:

| Categoría | Ejemplos | Para el viajero |
|---|---|---|
| `SMALL` | AirPods, perfume, medicinas | Cabe en cualquier equipaje |
| `MEDIUM` | Teléfono, tablet, Nintendo Switch | Espacio moderado |
| `LARGE` | PlayStation, laptop, dron | Requiere espacio dedicado |

Sirve para dos cosas: que el viajero juzgue "si le cabe", y como factor del
pricing.

## 4. Algoritmo de ganancia del viajero (PricingPolicy)

Determinista, transparente y **configurable por entorno** (cambiar la política
comercial = cambiar config, no desplegar):

```
reward = BASE_FEE
       + VALUE_RATE × min(estimatedPrice, VALUE_CAP)
       + SIZE_FEE[sizeCategory]
```

Defaults: `BASE_FEE=5 USD` · `VALUE_RATE=5%` · `VALUE_CAP=1500` ·
`SIZE_FEE: S=3, M=8, L=15`.

| Ejemplo | Cálculo | Ganancia |
|---|---|---|
| AirPods $249 (S) | 5 + 12.45 + 3 | **$20.45** |
| iPhone $1,099 (M) | 5 + 54.95 + 8 | **$67.95** |
| PS5 $499 (L) | 5 + 24.95 + 15 | **$44.95** |

- Se calcula **al crear el pedido** y se persiste (`travelerRewardAmount`):
  cambiar la config después no altera pedidos ya publicados.
- `GET /pricing/quote?price=&size=` (público) da la cotización con desglose
  para previsualizar en el formulario del Buyer.
- Racional del tope (`VALUE_CAP`): sin él, artículos muy caros inflan la
  ganancia sin reflejar esfuerzo real; el valor alto se cubrirá con
  seguro/escrow cuando exista el contexto Payments.
- Factores futuros documentados (no implementados): urgencia (`neededBy`
  cercano), corredor (distancia/demanda), comisión de plataforma sobre el
  reward (requiere Payments).

## 5. Impacto técnico

- **DB**: `orders` +`sizeCategory` (enum, default MEDIUM) +`travelerRewardAmount`;
  −`requiredCapacity`. `trips` −`totalCapacity` −`remainingCapacity` (y su CHECK).
  `assignments.expiresAt` pasa a nullable (sin ventana de aceptación).
- **Config**: se eliminan `MATCH_*`; entran `PRICING_*` (validadas al arranque).
- **API**: se eliminan `POST /assignments/:id/accept|reject`; entran
  `GET /trips/:id/available-orders`, `POST /trips/:id/claim/:orderId`,
  `GET /pricing/quote`. `GET /assignments` conserva el contexto del pedido y
  suma la ganancia.
- **UI**: el form del pedido pide tamaño y muestra la ganancia estimada; el
  espacio del Traveler cambia de "ofertas con countdown" a "encargos
  disponibles por viaje" con botón de reclamar.
