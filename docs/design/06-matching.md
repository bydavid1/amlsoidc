# 06 — Motor de Matching (asignación Order ↔ Trip)

> Algoritmo **determinista, sin IA**, explicable y auditable. Vive en el módulo
> `matching` detrás del puerto `MatchingPolicy` (ver `02-arquitectura.md`).

## 1. Definición del problema

Dada una `Order` en estado `PENDING_ASSIGNMENT`, encontrar el **mejor** `Trip`
compatible y crear un `Assignment`. El Buyer nunca elige; el sistema decide.

Separamos dos preguntas:

- **¿Es compatible?** (hard constraints) → filtro binario. Un `Trip` que no
  los cumple queda descartado, sin importar lo demás.
- **¿Es el mejor?** (soft scoring) → ranking determinista de los candidatos
  que pasaron el filtro.

Esta separación es deliberada: mezclar reglas duras dentro del score produce
asignaciones inválidas "porque puntuaban alto". Primero se garantiza la validez,
después se optimiza la calidad.

**Entrada:** una `Order` (con su `Corridor`, ventana de necesidad, `FulfillmentType`).
**Salida:** un `Assignment` propuesto al mejor `Traveler`, o `NoMatchFound` (la
`Order` permanece `PENDING_ASSIGNMENT` y se reintenta / expira).

## 2. Fase de filtrado — Hard constraints

Un `Trip` es **candidato** de una `Order` solo si cumple TODOS:

| # | Filtro | Justificación |
|---|--------|---------------|
| H1 | `trip.corridor == order.corridor` (mismo país origen **y** destino) | Un viajero de US→SV no sirve para un pedido MX→GT. Es la restricción física central. |
| H2 | `trip.window.arrivalDate` dentro de la ventana aceptable del pedido (p. ej. `<= order.neededBy`, y no en el pasado) | El producto debe llegar a tiempo. |
| H3 | `trip.remainingCapacity >= order.requiredCapacity` | No se puede sobrecargar un viaje (invariante de dominio). |
| H4 | `trip.status == OPEN` | Viajes `CLOSED`/`IN_PROGRESS`/`CANCELLED` no aceptan carga nueva. |
| H5 | `traveler.status == ACTIVE` y no suspendido | Un Traveler suspendido no puede recibir asignaciones. |
| H6 | `traveler.reputation.score >= REPUTATION_MIN` (umbral **configurable**) | Regla de dominio: la reputación filtra solo contra un umbral explícito, nunca de forma implícita. Travelers nuevos usan un `score` inicial neutro para no excluirlos de raíz (cold-start). |
| H7 | `traveler.userId != order.buyerId` | Un usuario que es Buyer y Traveler a la vez no se auto-asigna. |
| H8 | El Traveler **no** rechazó/expiró previamente esta misma `Order` | Evita reofrecer lo ya rechazado y ciclos infinitos. Se consulta el historial de `Assignment` de esa orden. |
| H9 | `fulfillmentType` compatible con el tipo de viaje | En el MVP todo es `BUYER_SHIPS_TO_TRAVELER`; el filtro existe para no acoplar el motor a un solo tipo (ver §10). |

Si tras H1–H9 el conjunto de candidatos es vacío → `NoMatchFound`.

## 3. Fase de scoring — Ranking determinista

Sobre los candidatos válidos aplicamos una función de puntuación **lineal,
ponderada y normalizada** a `[0,1]` por factor. Es explicable (se puede mostrar
al equipo de operación por qué ganó cada Trip) y auditable (se persiste el
desglose del score en el `Assignment`).

```
score(trip, order) =
    W_time       * timeFit(trip, order)
  + W_reputation * reputationNorm(traveler)
  + W_capacity   * capacityFit(trip, order)
  + W_fairness   * queueAge(order)
  + W_load       * (1 - travelerLoadNorm(traveler))
```

| Factor | Qué mide | Cómo se normaliza a [0,1] | Peso por defecto |
|--------|----------|---------------------------|------------------|
| `timeFit` | Qué tan cerca llega el viaje de la fecha ideal (ni tarde ni demasiado anticipado) | `1 - (|arrival - ideal| / maxWindowDays)`, acotado | **0.35** |
| `reputationNorm` | Reputación del Traveler | `score / 5` (o escala usada) | **0.30** |
| `capacityFit` | Holgura de capacidad (preferir viajes que aún dejan margen, sin desperdiciar) | curva que penaliza tanto el sobre-ajuste como el desperdicio extremo | **0.15** |
| `queueAge` | Antigüedad de la Order en cola (fairness / anti-inanición) | `min(waitingHours / maxWaitHours, 1)` | **0.15** |
| `travelerLoad` | Carga activa del Traveler (repartir trabajo) | `activeAssignments / maxParallel`, invertido | **0.05** |

Los pesos **suman 1** y son **configuración**, no constantes de código
(ver §8). Cambiar la estrategia comercial (p. ej. priorizar velocidad sobre
reputación) es cambiar config, no desplegar.

### Desempate determinista (tie-breaking)

Ante `score` empatado (mismo valor redondeado a N decimales), se aplica en orden:

1. Mayor `reputation.score`.
2. `arrivalDate` más temprana.
3. Menor carga activa del Traveler.
4. `trip.id` ascendente (garantiza reproducibilidad total).

El paso 4 asegura que el resultado **nunca** dependa del orden de lectura de la
base de datos ni del reloj: dos ejecuciones con los mismos datos dan el mismo
ganador. Esto es clave para poder testear y auditar el motor.

## 4. Estrategia de asignación — 1-a-1 con ventana de aceptación

**Decisión: oferta 1-a-1 al mejor candidato, con ventana de aceptación y
fallback al siguiente.** Descartamos la oferta simultánea a varios Travelers
("primero en aceptar gana") porque:

- Reservaría capacidad en varios viajes a la vez → sobre-reserva y liberaciones
  masivas; contradice la invariante "un pedido, una asignación activa".
- Genera carreras y frustración ("acepté y ya no estaba disponible").
- La consistencia de capacidad se vuelve mucho más difícil.

La oferta 1-a-1 es más simple, respeta las invariantes y es suficiente para el
volumen del MVP. Si en el futuro la latencia de aceptación fuera un problema, se
puede pasar a "top-K en cascada rápida" **sin cambiar el scoring**.

### Ciclo de vida del `Assignment`

```
        matching elige mejor candidato
                 │
                 ▼
            OFFERED ───────── timeout (ACCEPTANCE_WINDOW) ──► EXPIRED
             │   │                                              │
     accept  │   │ reject                                       │ fallback
             ▼   ▼                                              ▼
         ACCEPTED  REJECTED ───────────────────────────► (siguiente candidato)
             │
             ▼
     Order.status = ASSIGNED ; capacidad del Trip reservada firme
```

- Al pasar a `OFFERED` se **reserva** capacidad en el `Trip` (invariante de
  no sobre-asignación) dentro de la **misma transacción (UoW)** que crea el
  `Assignment` y mueve la `Order` a `ASSIGNED` provisional / mantiene el
  `offer` (ver `02-arquitectura.md`, frontera transaccional).
- `REJECTED` / `EXPIRED` → se **libera** la capacidad y se dispara un nuevo
  intento con el siguiente mejor candidato (excluyendo a quien rechazó, H8).
- `ACCEPTED` → capacidad reservada firme; `Order` queda `ASSIGNED` y entra al
  sub-flujo de `Fulfillment` (`SOURCING`).
- Tras `MAX_REASSIGN_ATTEMPTS` intentos sin aceptación o vencida la ventana
  global de la orden → `Order` → `EXPIRED`.

## 5. Disparadores (cuándo corre el matching)

Modelo **event-driven + reintento**, no barrido global constante:

| Disparador | Alcance | Por qué |
|------------|---------|---------|
| `OrderCreated` | Matchear esa Order | Respuesta inmediata al Buyer. |
| `TripPublished` | Re-evaluar Orders `PENDING_ASSIGNMENT` de **ese corredor** | Un viaje nuevo puede desbloquear pedidos que no tenían candidato. Alcance acotado por corredor, no todo el universo. |
| `AssignmentRejected` / `AssignmentExpired` | Reintentar esa Order con el siguiente candidato | Continuidad del flujo. |
| Job periódico (fallback) | Barrer Orders `PENDING_ASSIGNMENT` antiguas | Red de seguridad ante eventos perdidos; frecuencia baja. |

**Pull con orquestación por eventos**, no push a Travelers: el motor decide y
ofrece; el Traveler reacciona. En el MVP los eventos son in-process
(EventEmitter); el diseño permite mover el trigger a una cola (Redis/broker) sin
cambiar la lógica de scoring (ver §7).

## 6. Concurrencia y consistencia

Riesgos: doble asignación de una Order y sobre-reserva de capacidad de un Trip
bajo peticiones concurrentes.

Defensas en capas:

1. **Transacción atómica (UoW):** crear `Assignment` + reservar capacidad +
   mover estado de la Order ocurren en una sola transacción de Postgres.
2. **Reserva atómica de capacidad:** decremento condicional
   `UPDATE trip SET remaining = remaining - :n WHERE id = :id AND remaining >= :n`
   (o bloqueo de fila con `SELECT ... FOR UPDATE`). Si afecta 0 filas → no había
   capacidad → ese candidato se descarta y se pasa al siguiente.
3. **Restricción única como red de seguridad (DB):** índice único parcial que
   impide dos `Assignment` activos por Order (ver `03-base-de-datos.md`). Aunque
   la lógica fallara, la base de datos rechaza el segundo.

Requisitos que impongo a `database-engineer` en §PROPAGAR.

## 7. Escalabilidad

- **Indexación:** índice compuesto `(originCountry, destinationCountry, arrivalDate, status)`
  en `Trip` para que el filtro H1–H4 sea un range-scan, no un full-scan.
- **Trabajo acotado por corredor:** el matching de una Order solo mira Trips de
  su corredor; nunca recorre todo el universo.
- **Cota de candidatos:** se evalúan como máximo los primeros `MAX_CANDIDATES`
  Trips ya pre-ordenados por índice (fecha), no todos. El score fino se calcula
  solo sobre ese subconjunto.
- **Colas por corredor (evolución):** cuando el volumen lo exija, cada corredor
  se procesa en su propia cola (Redis/broker) de forma independiente y paralela;
  el algoritmo por-Order no cambia.
- **Camino a servicio propio:** como el motor está detrás del puerto
  `MatchingPolicy` y se dispara por eventos, extraerlo a un microservicio en el
  futuro es reemplazar el transporte (evento in-process → mensaje en broker) y
  la coordinación transaccional (UoW → saga), **sin reescribir el scoring**.

## 8. Configurabilidad (nada hardcodeado)

| Parámetro | Descripción | Dónde vive |
|-----------|-------------|------------|
| `REPUTATION_MIN` | Umbral mínimo de reputación (H6) | config validada al arranque |
| `REPUTATION_COLD_START` | Score inicial de Travelers nuevos | config |
| `W_time / W_reputation / W_capacity / W_fairness / W_load` | Pesos del score (deben sumar 1; se valida) | config |
| `ACCEPTANCE_WINDOW` | Tiempo que un Traveler tiene para aceptar una oferta | config |
| `MAX_REASSIGN_ATTEMPTS` | Reintentos antes de expirar la Order | config |
| `MAX_CANDIDATES` | Tope de candidatos evaluados por corrida | config |
| `MAX_PARALLEL_PER_TRAVELER` | Carga máxima activa por Traveler | config |

Vivir en config (con validación de esquema al arrancar) permite ajustar la
política comercial sin desplegar y probar variaciones por ambiente.

## 9. Casos borde

| Caso | Comportamiento |
|------|----------------|
| Ningún candidato | `NoMatchFound`; Order sigue `PENDING_ASSIGNMENT`; reintenta ante `TripPublished`; expira tras ventana global → `EXPIRED`. |
| Empate de score | Desempate determinista §3. |
| Traveler cancela su Trip con asignaciones activas | Cada `Assignment` activo de ese Trip se invalida → sus Orders vuelven a `PENDING_ASSIGNMENT` y se re-matchean; se notifica a los Buyers. |
| Capacidad cambia entre scoring y reserva | La reserva atómica (§6.2) falla → se descarta ese Trip y se toma el siguiente candidato. |
| Corredor sin Travelers | Igual que "ningún candidato"; útil para alimentar un panel de "corredores con demanda insatisfecha". |
| Traveler rechaza repetidamente | H8 lo excluye de esa Order; su tasa de rechazo puede penalizar su reputación (regla de `reputation`, no del matching). |

## 10. Extensibilidad a otros tipos de Fulfillment

El motor **no asume** `BUYER_SHIPS_TO_TRAVELER`:

- Los hard filters operan sobre conceptos genéricos (`Corridor`, fecha,
  capacidad, estado), no sobre pasos específicos de compra.
- H9 permite que cada `FulfillmentType` declare condiciones de compatibilidad
  adicionales sin tocar H1–H8.
- `WAREHOUSE_FULFILLMENT` / `LOCAL_INVENTORY` en el futuro pueden requerir
  matchear contra una bodega/stock en vez de (o además de) un Trip: eso se
  modela como una `MatchingPolicy` alternativa seleccionada por `FulfillmentType`,
  reutilizando el mismo esqueleto filtro→score→asignación.

## PROPAGAR

- **→ database-engineer:**
  - Índice compuesto `Trip(originCountryId, destinationCountryId, arrivalDate, status)`.
  - Decremento atómico de `remainingCapacity` (condicional) o `SELECT ... FOR UPDATE`.
  - Índice único **parcial** de un solo `Assignment` activo por `orderId`
    (`WHERE status IN ('OFFERED','ACCEPTED')`).
  - Persistir el desglose del `score` en el `Assignment` (auditoría) —
    columna JSON o tabla de detalle.
  - Consultar historial de `Assignment` por `(orderId, travelerId)` para H8.
- **→ config/devops:** todos los parámetros de §8 como variables de entorno
  validadas al arranque; validar que los pesos sumen 1.
- **→ api-designer:** el Buyer no ve ni elige candidatos; el resultado del
  matching solo se refleja como cambio de estado de la Order y como oferta al
  Traveler (`POST /assignments/:id/accept|reject`).
- **→ qa:** tests deterministas del scoring (mismos datos → mismo ganador),
  tests de concurrencia de reserva de capacidad, tests de fallback por
  rechazo/expiración.

## Supuestos de dominio a confirmar

- `order.requiredCapacity` y la unidad de `Capacity` (¿peso, volumen, "1 slot"?)
  — el MVP puede empezar con "1 pedido = 1 unidad" y refinar luego.
- Ventana aceptable del pedido: ¿el Buyer fija `neededBy` o se deriva por
  defecto del corredor? Sugerido: opcional, con default por corredor.
