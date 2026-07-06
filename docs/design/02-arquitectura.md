# Bringo — Documento de Arquitectura Técnica

> Autor: software-architect
> Estado: propuesta para revisión del orquestador
> Fecha: 2026-07-06
> Insumo principal: `docs/design/01-dominio.md` (domain-architect)
> Fuentes de verdad: `.claude/skills/ddd-modular-monolith/SKILL.md`,
> `.claude/skills/nestjs-conventions/SKILL.md`,
> `.claude/skills/bringo-domain-knowledge/SKILL.md`

Este documento traduce el **modelo de dominio** de Bringo a una **arquitectura
de software** concreta: un **monolito modular** en NestJS con **Clean
Architecture + DDD**. Define capas, módulos, casos de uso, comunicación entre
módulos, la frontera transaccional, la extensibilidad de Fulfillment, las
convenciones del proyecto y la estructura de carpetas.

No define schema de Postgres (→ `database-engineer`), ni endpoints/DTOs
concretos con sus campos (→ `api-designer`), ni el algoritmo de matching
(→ `matching-engine-architect`), ni el detalle de JWT/refresh/guards
(→ `security-engineer`). Aquí se decide **dónde vive cada cosa**, **cómo
dependen las piezas entre sí** y **qué reglas de estructura son innegociables**.

Convención de idioma: la prosa va en español; los identificadores y términos
técnicos van en inglés, para coincidir 1:1 con el código.

## Índice

1. Arquitectura general (Clean Architecture + DDD en monolito modular)
2. Casos de uso principales (capa application)
3. Módulos del sistema
4. Módulos transversales `core/` y `shared/`
5. Relaciones y comunicación entre módulos (+ frontera transaccional)
6. Extensibilidad de Fulfillment a nivel de arquitectura
7. Convenciones del proyecto
8. Estructura completa de carpetas
9. Tabla de decisiones arquitectónicas (ADR)
10. Propagaciones a otros agentes

---

## 1. Arquitectura general

### 1.1 Estilo: monolito modular con Clean Architecture por módulo

Bringo se despliega como **un solo proceso** (un `nest` app), pero internamente
está partido en **módulos independientes**, uno por bounded context del
dominio. Cada módulo aplica las **4 capas** del skill `ddd-modular-monolith`.
La regla de oro: **un módulo se entiende y se prueba en aislamiento**, y sus
límites están dibujados de modo que, si mañana hiciera falta, pudiera
extraerse a un servicio **sin reescribir su lógica interna** (sección 5.6).

No hay microservicios, ni broker externo, ni Redis como requisito duro. Todos
esos aparecen únicamente como **puntos de extensión futura** claramente
señalados.

### 1.2 Las 4 capas por módulo y la regla de dependencia

```
        ┌───────────────────────────────────────────────────────┐
        │                     interface (HTTP)                    │  controllers, DTOs
        │        traduce HTTP ⇄ casos de uso; versionado /v1      │  guards del módulo
        └───────────────────────────┬───────────────────────────┘
                                     │  depende de ↓
        ┌───────────────────────────▼───────────────────────────┐
        │                   application (use cases)               │  orquesta el dominio
        │   commands / queries, puertos, unidad de trabajo        │  1 caso de uso = 1 clase
        └───────────────┬───────────────────────┬───────────────┘
                        │  depende de ↓          │  depende de ↓
        ┌───────────────▼───────────┐   ┌────────▼──────────────┐
        │          domain           │◄──┤    infrastructure      │  Prisma, adapters,
        │  entities, VOs, agregados,│   │  implementa interfaces │  clientes externos,
        │  interfaces de repositorio│   │  de domain (repos,     │  mappers ORM⇄dominio
        │  eventos, reglas puras    │   │  ports)                │
        └───────────────────────────┘   └───────────────────────┘
             ▲  NO importa Prisma, NestJS de infra, ni HTTP
```

**Regla de dependencia (innegociable):** las flechas apuntan **siempre hacia
el dominio**.

```
interface → application → domain ← infrastructure
```

- `domain` no importa **nada** de las otras tres capas ni de frameworks. Es
  TypeScript puro: entidades, value objects, agregados, **interfaces** de
  repositorio, eventos de dominio y reglas. Se testea sin levantar Nest ni DB.
- `application` depende **solo** de abstracciones de `domain` (interfaces de
  repositorio, servicios de dominio, puertos). Nunca de implementaciones
  concretas de `infrastructure`.
- `infrastructure` **implementa** las interfaces de `domain` (repositorios con
  Prisma, adapters de otros módulos, clientes externos). Es la única que conoce
  Prisma, HTTP externo, etc.
- `interface` traduce peticiones HTTP a **comandos/queries** de `application` y
  formatea la respuesta. Aquí vive el versionado de API (`/api/v1`).

### 1.3 Cómo se garantiza que el dominio NO dependa de Prisma / NestJS / HTTP

Cuatro mecanismos combinados:

1. **Repository Pattern con inversión de dependencias (DIP).** La *interfaz*
   del repositorio (`OrderRepository`) vive en `domain/repositories/` y habla el
   lenguaje del negocio (`findByIdOrFail`, `findPendingForMatching`), nunca
   `findMany({ where })`. La *implementación* (`PrismaOrderRepository`) vive en
   `infrastructure/persistence/prisma/`. El caso de uso depende de la interfaz;
   Prisma queda al otro lado de la frontera.

2. **Tokens de inyección, no clases concretas.** El binding
   interfaz→implementación se hace en el `@Module` con un **token** (Symbol o
   `const`), p. ej. `{ provide: ORDER_REPOSITORY, useClass: PrismaOrderRepository }`.
   El caso de uso recibe `@Inject(ORDER_REPOSITORY) repo: OrderRepository`.
   **Prohibido** inyectar la clase Prisma directamente en application/domain.

3. **Pureza del `domain`.** `domain` no usa decoradores de infraestructura de
   NestJS (`@Controller`, `@Entity`), no importa `@prisma/client`, no importa
   `@nestjs/common` salvo — excepcionalmente — el símbolo puro que no arrastra
   framework. Las entidades y VOs son clases planas. Los servicios de dominio
   pueden ser clases planas registrables por DI, pero su lógica no toca I/O.

4. **Puertos de infraestructura como interfaces de dominio/aplicación.** Todo
   lo que sea "efecto de mundo real" (reloj, generador de ids, publicación de
   eventos, unidad de trabajo transaccional, almacenamiento de archivos, envío
   de notificaciones, llamada a otro módulo) se expresa como **interfaz (port)**
   en `domain` o `application`, y se implementa en `infrastructure`. El dominio
   pide "guárdame esto atómicamente" a través de `UnitOfWork`, sin saber que
   por debajo hay `prisma.$transaction`.

**Detección de fugas (señales de alerta del skill, adoptadas como reglas de
lint):** un archivo de `domain/` que importa `@prisma/client`; un caso de uso
que arma una query Prisma inline; una regla de negocio escrita en un
controller. Estas se bloquean con reglas de import-boundaries en ESLint
(sección 7 y propagación a devops/qa).

### 1.4 SOLID aplicado en concreto (no dogmático)

| Principio | Cómo se materializa en Bringo |
|---|---|
| **SRP** (responsabilidad única) | Un módulo = un bounded context = una razón de cambio (sección 3). Un caso de uso = un comando/query (`CreateOrderUseCase` no cancela ni entrega). Un repositorio por agregado. El módulo `admin` no tiene lógica propia: solo compone. |
| **OCP** (abierto/cerrado) | `FulfillmentStrategy` + resolver: agregar `WAREHOUSE_FULFILLMENT` es **agregar** una clase, no **modificar** `Order`/`Trip`/`Assignment` (sección 6). `MatchingPolicy` como puerto: el algoritmo se cambia sin tocar el caso de uso. Una versión de API v2 se abre agregando controllers, no modificando use cases. |
| **LSP** (sustitución) | Toda `FulfillmentStrategy` respeta el contrato (`isReadyForTransport`, `requiresTransport`, `requiresTravelerAssignment`, `handle`); el `Order` las trata de forma uniforme sin `if (type === ...)`. Toda impl de `OrderRepository` es intercambiable (Prisma hoy, otra mañana) sin que el caso de uso lo note. |
| **ISP** (segregación de interfaces) | Puertos **finos y por intención**: `OrdersCoordinationApi` (mutación de estado del pedido) está separada de `OrdersQueryApi` (lectura); `TripsCapacityApi` (reservar/liberar) está separada de `TripsQueryApi` (candidatos). Un consumidor depende solo del slice que usa; matching no ve métodos de lectura que no necesita. |
| **DIP** (inversión de dependencias) | `application`/`domain` dependen de **interfaces**; `infrastructure` las implementa; DI las une por token. Se aplica **también entre módulos**: cuando una dependencia iría "contra corriente" del grafo (p. ej. `orders` necesita liberar un `Assignment`), `orders` **declara** el puerto y `matching` lo **implementa** (sección 5.4), preservando el grafo acíclico. |

---

## 2. Casos de uso principales (capa application)

Los casos de uso formalizan la sección 9 del documento de dominio como clases
de `application`. Se distinguen dos naturalezas (**CQRS ligero**, sin imponer
buses):

- **Command** — muta estado, valida invariantes de dominio, corre dentro de una
  **unidad de trabajo transaccional** y **emite eventos** tras el commit. Un
  command = una clase `XxxUseCase` con un `XxxCommand` de entrada (objeto plano
  de application, **distinto** del DTO HTTP).
- **Query** — solo lee, **no** emite eventos, no muta, puede **puentear el
  dominio rico** y devolver read models/proyecciones vía una `XxxQueryPort`
  (lectura optimizada). Marcadas `(Q)`.

No se impone `CommandBus`/`QueryBus`: los controllers inyectan los use cases
directamente. Un bus mediador es punto de extensión futura si aparece
necesidad de middlewares transversales (retry, tracing por comando).

**Columna "Multi-agregado tx":** `sí` significa que el comando coordina más de
un agregado (posiblemente de más de un módulo) en **una** transacción
(sección 5.3).

### 2.1 Módulo `identity`

| Caso de uso | Tipo | Actor | Agregados | Puertos / repos | Eventos | Multi-agregado tx |
|---|---|---|---|---|---|---|
| `RegisterUser` | C | Invitado | `User` | `UserRepository` (unicidad email) | `UserRegistered` | no |
| `GrantRole` | C | Sistema (interno) | `User` | `UserRepository` | `RoleGranted` | no |
| `SuspendUser` / `ReactivateUser` | C | Admin | `User` | `UserRepository` | `UserSuspended` | no |
| `GetUserAccess` | Q | Sistema/auth | — | `UserRepository` (read) | — | no |

`identity` publica `IdentityAccessApi` (verificar existencia/estado, leer
roles, conceder rol) para el resto de módulos. El **detalle de login/JWT/
refresh** es de `security-engineer` y vive en `auth` (sección 3.3).

### 2.2 Módulo `orders` (Ordering — incluye Fulfillment y BuyerProfile)

| Caso de uso | Tipo | Actor | Agregados | Puertos / repos | Eventos | Multi-agregado tx |
|---|---|---|---|---|---|---|
| `RegisterBuyerProfile` | C | User autenticado | `BuyerProfile` | `BuyerProfileRepository`, `IdentityAccessApi` (grant `BUYER`) | `BuyerProfileCreated` | sí (perfil + rol) |
| `CreateOrder` | C | Buyer | `Order` (+crea `Fulfillment`) | `OrderRepository`, `FulfillmentStrategyResolver`, `GeographyApi` (corredor válido), `EnabledCorridorPolicy` | `OrderCreated` | no |
| `ConfirmPurchase` | C | Buyer | `Order.Fulfillment` | `OrderRepository` | `ProductPurchased` | no |
| `ConfirmPackageReceived` | C | Traveler | `Order.Fulfillment` | `OrderRepository` | `PackageReceivedByTraveler` | no |
| `MarkInTransit` | C | Traveler | `Order` | `OrderRepository` | `OrderInTransit` | no |
| `MarkReadyForDelivery` | C | Traveler | `Order` | `OrderRepository` | `OrderReadyForDelivery` | no |
| `ConfirmDelivery` | C | **Buyer** | `Order` | `OrderRepository` | `OrderDelivered` | no |
| `ReportDeliveryFailure` | C | Traveler/Buyer | `Order` | `OrderRepository` | `OrderDeliveryFailed` | no |
| `RescheduleDelivery` | C | Traveler | `Order` | `OrderRepository` | `OrderReadyForDelivery` | no |
| `CompleteOrder` | C | Sistema | `Order` | `OrderRepository` | `OrderCompleted` | no |
| `CancelOrder` | C | Buyer/Admin | `Order` (+`Assignment`+`Trip` si asignado) | `OrderRepository`, `AssignmentReleaseApi` (outbound → matching) | `OrderCancelled` (+`TripCapacityReleased`) | **sí** |
| `ExpireOrder` | C | Sistema | `Order` (+release si aplica) | `OrderRepository`, `AssignmentReleaseApi` | `OrderExpired` | **sí** (condicional) |
| `GetOrderDetail` | Q | Buyer/Traveler/Admin | — | `OrderQueryPort` (proyección aplanada) | — | no |
| `ListBuyerOrders` | Q | Buyer | — | `OrderQueryPort` | — | no |
| `GetOrderTimeline` | Q | Buyer/Traveler/Admin | — | `OrderTimelineQueryPort` (proyección de eventos) | — | no |

`orders` publica `OrdersCoordinationApi` (mutación dirigida: `markAssigned`,
`startSourcing`, `releaseToPending`, `markCancelled`, `markDisputed`,
`complete`) para que matching/incidents/reputation avancen el pedido **sin
conocer sus invariantes internas**, y `OrdersQueryApi` para lectura de estado y
partes del pedido.

### 2.3 Módulo `trips` (Trips — incluye TravelerProfile)

| Caso de uso | Tipo | Actor | Agregados | Puertos / repos | Eventos | Multi-agregado tx |
|---|---|---|---|---|---|---|
| `RegisterTravelerProfile` | C | User autenticado | `TravelerProfile` | `TravelerProfileRepository`, `IdentityAccessApi` (grant `TRAVELER`) | `TravelerProfileCreated` | sí (perfil + rol) |
| `PublishTrip` | C | Traveler | `Trip` | `TripRepository`, `GeographyApi`, `EnabledCorridorPolicy` | `TripPublished` | no |
| `CloseTrip` | C | Traveler/Sistema | `Trip` | `TripRepository` | `TripCompleted` | no |
| `CancelTrip` | C | Traveler/Admin | `Trip` (+ assignments/orders afectados) | `TripRepository`, `TripCancellationCoordinationApi` (outbound → matching) | `TripCancelled` (+ recuperación) | **sí** |
| `ReserveCapacity` / `ReleaseCapacity` | C | Sistema (vía `TripsCapacityApi`) | `Trip` | `TripRepository` | `TripCapacityReserved`/`TripCapacityReleased` | (participa en tx del llamador) |
| `UpdateTravelerReputationCache` | C | Sistema (handler de evento) | `TravelerProfile` | `TravelerProfileRepository` | — | no |
| `FindCompatibleTrips` | Q | Sistema (matching) | — | `TripQueryPort` (candidatos por corredor/ventana/capacidad) | — | no |
| `GetTripDetail` / `ListTravelerTrips` | Q | Traveler/Admin | — | `TripQueryPort` | — | no |

`trips` publica `TripsCapacityApi` (reservar/liberar, invariante `reserved ≤
total`) y `TripsQueryApi` (candidatos y lectura). Mantiene un **snapshot de
reputación cacheado** en `TravelerProfile`, actualizado por evento
`ReputationRecalculated` — así matching lee reputación **desde trips**, sin
depender de `reputation` en caliente.

### 2.4 Módulo `matching` (Matching — dueño de `Assignment`; hub de coordinación)

| Caso de uso | Tipo | Actor | Agregados | Puertos / repos | Eventos | Multi-agregado tx |
|---|---|---|---|---|---|---|
| `AssignTravelerToOrder` | C | Sistema | `Assignment` (+`Order`+`Trip`) | `AssignmentRepository`, `MatchingPolicy` (port), `OrdersCoordinationApi`, `TripsCapacityApi`, `TripsQueryApi`, `OrdersQueryApi` | `TravelerAssigned`, `OrderAssigned`, `TripCapacityReserved` | **sí** |
| `AcceptAssignment` | C | Traveler | `Assignment` (+`Order`) | `AssignmentRepository`, `OrdersCoordinationApi` | `AssignmentAccepted`, `OrderSourcingStarted` | **sí** |
| `RejectAssignment` | C | Traveler | `Assignment` (+`Order`+`Trip`) | `AssignmentRepository`, `OrdersCoordinationApi`, `TripsCapacityApi` | `AssignmentRejected`, `OrderAssignmentReleased`, `TripCapacityReleased` | **sí** |
| `ExpireAssignment` | C | Sistema | `Assignment` (+`Order`+`Trip`) | idem `RejectAssignment` | `AssignmentExpired`, `OrderAssignmentReleased`, `TripCapacityReleased` | **sí** |
| `ReleaseAssignmentForCancellation` | C | Sistema (adapter de `AssignmentReleaseApi`) | `Assignment` (+`Trip`) | `AssignmentRepository`, `TripsCapacityApi` | `TripCapacityReleased` | **sí** |
| `ReleaseAssignmentsForCancelledTrip` | C | Sistema (adapter de `TripCancellationCoordinationApi`) | `Assignment` (+`Order`) | `AssignmentRepository`, `OrdersCoordinationApi` | `AssignmentCancelled`, `OrderAssignmentReleased` | **sí** |
| `GetAssignmentDetail` / `ListAssignmentsForTraveler` | Q | Traveler/Admin | — | `AssignmentQueryPort` | — | no |

El **algoritmo** que elige "el mejor Trip" es de `matching-engine-architect` y
se enchufa detrás del puerto `MatchingPolicy`. Aquí solo se decide que
`matching` **es dueño del `Assignment`** y **es el hub transaccional** entre
Order y Trip (sección 5.3–5.4).

### 2.5 Módulo `reputation`

| Caso de uso | Tipo | Actor | Agregados | Puertos / repos | Eventos | Multi-agregado tx |
|---|---|---|---|---|---|---|
| `RateCounterpart` | C | Buyer/Traveler | `Rating` (+ recálculo) | `RatingRepository`, `OrdersQueryApi` (verificar `DELIVERED`/partes), `OrdersCoordinationApi` (posible `complete`) | `CounterpartRated`, `ReputationRecalculated` (+ posible `OrderCompleted`) | **sí** (condicional al cierre) |
| `GetReputation` | Q | Cualquiera | — | `ReputationQueryPort` | — | no |

`reputation` emite `ReputationRecalculated`; `trips` lo consume para refrescar
el cache del `TravelerProfile`. Así el matching nunca depende de `reputation`
en caliente (desacople por evento).

### 2.6 Módulo `incidents`

| Caso de uso | Tipo | Actor | Agregados | Puertos / repos | Eventos | Multi-agregado tx |
|---|---|---|---|---|---|---|
| `RaiseDispute` | C | Buyer/Traveler/Sistema | `Dispute` (+`Order`→`DISPUTED`) | `DisputeRepository`, `OrdersCoordinationApi` | `OrderDisputed` | **sí** |
| `ResolveDispute` | C | Admin | `Dispute` (+`Order`→`COMPLETED`\|`CANCELLED`) | `DisputeRepository`, `OrdersCoordinationApi` | `DisputeResolved`, `OrderCompleted`\|`OrderCancelled` | **sí** |
| `GetDispute` / `ListOpenDisputes` | Q | Admin | — | `DisputeQueryPort` | — | no |

### 2.7 Módulos genéricos / reactivos

- **`notifications`**: sin comandos de negocio. Suscribe **handlers** a eventos
  (`OrderAssigned`, `AssignmentAccepted`, `OrderDelivered`, …) y entrega
  mensajes. Puede leer datos de contacto vía `IdentityAccessApi`. Persiste
  `Notification` (estado enviada/leída, operativo).
- **`audit`**: sin comandos de negocio. Handler genérico que persiste un
  **audit trail append-only** de todos los eventos de dominio. Insumo de la
  proyección `OrderStatusHistory` (materialización → `database-engineer`).
- **`geography`**: catálogo. Comandos administrativos mínimos
  (`AddCountry`/`AddCity`, vía `admin`) y consultas
  (`GetCorridor`, `ValidateCorridor`, `IsCorridorEnabled`). Publica los VOs del
  **shared kernel** (`Corridor`, `Address`, `CountryRef`, `CityRef`).
- **`uploads`**: genérico técnico. `RequestUpload` / `ConfirmUpload` (según lo
  defina `api-designer`) detrás de `FileStorageApi`; devuelve una referencia de
  archivo (URL/id) que los módulos de negocio guardan como **valor**.

### 2.8 Módulo `admin` (composición, sin lógica propia)

`admin` **no** contiene casos de uso de negocio nuevos. Expone endpoints con
permisos elevados que **componen** casos de uso ya existentes:
`ResolveDispute` (incidents), `CancelOrder` (orders), `SuspendUser` (identity),
`CancelTrip` (trips), altas de catálogo (geography), y consultas de todos los
módulos. Toda la lógica y las invariantes siguen viviendo en el módulo dueño.

---

## 3. Módulos del sistema

### 3.1 Criterio de decisión

Regla del skill `ddd-modular-monolith`: **separa lo que cambia por razones
distintas; agrupa lo que cambia junto y no tiene sentido por separado.** Se
parte de los bounded contexts del documento de dominio (sección 2 de
`01-dominio.md`) y se mapean 1:1 a módulos NestJS, más los módulos
transversales/de composición que exige una app de producción.

### 3.2 Lista de módulos propuesta

**Módulos de negocio (un bounded context cada uno):**

| Módulo | Bounded context | Agregado(s) raíz | Razón de cambio (por qué es su propio módulo) |
|---|---|---|---|
| `identity` | Identity & Access | `User` | Reglas de identidad, credenciales y roles. Cambia por seguridad/IAM, no por marketplace. |
| `orders` | Ordering | `Order` (+`Fulfillment` interno), `BuyerProfile` | Ciclo de vida del pedido y tipos de cumplimiento (lado demanda). |
| `trips` | Trips | `Trip`, `TravelerProfile` | Reglas de oferta: publicación, capacidad, ventana (lado oferta). |
| `matching` | Matching | `Assignment` | Criterios de asignación y ciclo aceptar/rechazar/expirar. |
| `reputation` | Reputation | `Rating` | Fórmula de reputación (promedio, recencia, tiers). |
| `incidents` | Incidents | `Dispute` | Política de resolución de incidencias (Admin). |
| `geography` | Geography | `Country`, `City` (+ `Corridor` VO) | Catálogo de referencia; shared kernel de solo lectura. |
| `notifications` | Notifications | `Notification` | Reglas de entrega y canales; reactivo a eventos. |

**Módulos de plataforma / composición (bajo `modules/`, sin agregado de
negocio propio):**

| Módulo | Naturaleza | Responsabilidad |
|---|---|---|
| `auth` | Seguridad | Autenticación (login, JWT, refresh), guards globales. Depende de `identity`. Detalle: `security-engineer`. |
| `admin` | Composición (BFF) | Compone casos de uso existentes con permisos elevados. **Cero lógica de negocio.** |
| `audit` | Observabilidad de negocio | Consume eventos y persiste audit trail. Sin lógica que decida estado. |
| `uploads` | Genérico técnico | Almacenamiento de archivos detrás de `FileStorageApi`. |

**Transversales que NO son módulos de `modules/`:** `core/` (infra de framework)
y `shared/` (kernel puro). Ver sección 4. **Health** vive en `core/` (concern
operativo, sin dominio).

### 3.3 Decisiones explícitas pedidas

**Auth vs Users → dos módulos: `identity` (dominio) + `auth` (mecanismo).**
`identity` es dueño del agregado `User` (identidad, credenciales por
referencia, roles, `status`). `auth` implementa **cómo** se prueba esa
identidad (login, emisión/validación de JWT, refresh, hashing, guards
globales). Cambian por razones distintas (**SRP**): las reglas de roles cambian
por marketplace; la estrategia de tokens/sesión cambia por seguridad. `auth`
depende de `identity` (lee usuario+roles); nunca al revés. `RefreshToken`/
`Session` **no** son dominio (confirmado en `01-dominio.md` 3.4): viven en
`auth`/infraestructura, territorio de `security-engineer`.
*Alternativa descartada:* fusionar en un `iam` único — se descarta porque
mezclaría el dominio de identidad (estable, de negocio) con el mecanismo de
seguridad (volátil, técnico), y complicaría una futura extracción del servicio
de auth.

**Buyers/Travelers → NO son módulos ni viven en `identity`; son perfiles de
rol dentro de su contexto.** `BuyerProfile` vive en `orders` (Ordering) y
`TravelerProfile` vive en `trips` (Trips). Un `User` puede ser Buyer **y**
Traveler a la vez con una sola cuenta. El perfil cambia junto con el contexto
que lo consume: `TravelerProfile` cachea el snapshot de reputación para el
matching y guarda la dirección de envío del fulfillment (concerns de oferta);
`BuyerProfile` guarda la libreta de direcciones de entrega (concern de
demanda). Ponerlos en `identity` acoplaría el módulo de seguridad a reglas de
marketplace (viola **SRP**) y haría un módulo "bolsa de gatos".
*Alternativa descartada:* módulos `buyers`/`travelers` propios — quedarían
anémicos (solo un perfil) y partirían artificialmente la lógica de demanda/
oferta que ya vive en `orders`/`trips`.

**Matching + Assignments → un solo módulo `matching`.** El `Assignment` **es**
la salida del proceso de matching; no tiene sentido sin él, y una nueva regla
de asignación normalmente cambia cómo se crea/puntúa el `Assignment`. Cambian
juntos → se agrupan. Separar "Assignments" (persistencia del resultado) de
"Matching" (proceso) produciría un módulo anémico y un acoplamiento cíclico
entre ambos. El **algoritmo** vive detrás del puerto `MatchingPolicy`
(propiedad de `matching-engine-architect`), pero el **módulo** es uno.

**Fulfillment → NO es módulo; vive dentro de `orders`.** `Fulfillment` es una
**entidad interna** de `Order` (`01-dominio.md` 4.2): su estado debe ser
transaccionalmente consistente con `Order.status` (no puede haber `Order =
IN_TRANSIT` con fulfillment "aún no comprado"). Por tanto la entidad
`Fulfillment`, la interfaz `FulfillmentStrategy`, el `FulfillmentStrategyResolver`
y las strategies del MVP viven en `orders/domain/fulfillment/`. Un tipo futuro
que necesite **infra pesada** (p. ej. `WAREHOUSE_FULFILLMENT` con integración a
un WMS) puede aportar un **módulo companion** que registre su strategy en el
resolver por DI, sin tocar `orders` (sección 6).

**Admin/Audit/Health/Uploads:**
- `admin` — **transversal de composición**, sin lógica ni agregado. Solo
  orquesta casos de uso existentes con permisos de Admin.
- `audit` — **módulo consumidor de eventos**, no `core`. Se separa de `core`
  porque **posee estado** (audit trail persistido) y podría extraerse a un log
  store propio; `core` debe ser infra sin estado de negocio.
- `health` — **en `core/`**: liveness/readiness son concern operativo, sin
  dominio; viven con el arranque de la app.
- `uploads` — **módulo genérico técnico**: single responsibility
  (almacenar/servir archivos) detrás de un puerto swappable (disco → S3), con
  su propio endpoint. No es `core` porque encapsula una integración externa y
  podría extraerse; los módulos de negocio dependen solo de una **referencia de
  archivo** (valor), no de sus internals.

### 3.4 Distinción logging (core) vs audit trail (módulo)

Son cosas distintas y se separan deliberadamente:
- **Structured logging + correlation id** = observabilidad técnica, sin
  semántica de negocio, sin estado persistente propio → `core/logging`.
- **Audit trail de eventos de dominio** = registro de negocio append-only, con
  estado y valor de auditoría/compliance, consumidor del bus de eventos →
  módulo `audit`.

---

## 4. Módulos transversales `core/` y `shared/`

### 4.1 Frontera core vs shared (la regla que las distingue)

| | `shared/` | `core/` |
|---|---|---|
| Naturaleza | **Puro**, framework-agnóstico, sin I/O | Infra de framework/runtime, con I/O |
| Contenido | VOs genéricos, building blocks de dominio, **interfaces** de puertos técnicos | Implementaciones NestJS: Prisma, logger, filtros, interceptores, config, bus de eventos, health |
| Quién puede importarlo | **Cualquier capa**, incluido `domain` y `application` | **Solo** `infrastructure`, `interface` y el bootstrap. **Nunca** `domain`/`application` |
| Regla mental | "Si lo importa el dominio, va en shared" | "Si arrastra NestJS/Prisma/HTTP, va en core" |

Esta frontera es la que **mantiene el dominio puro**: como `domain` solo puede
tocar `shared` (que no arrastra framework), es imposible que Prisma o NestJS de
infra se filtren al dominio a través de los transversales.

### 4.2 Contenido de `shared/`

- **Building blocks de dominio** (`shared/domain/`): clases base
  `AggregateRoot` (con `recordEvent()` / `pullEvents()`), `Entity`,
  `ValueObject`, `DomainEvent`, `Result`/`Guard` para validaciones, errores
  base (`DomainError`, `InvariantViolationError`).
- **Puertos técnicos como interfaces** (`shared/domain/ports/`): `UnitOfWork`
  (`runInTransaction<T>(work): Promise<T>`), `DomainEventPublisher`
  (`publishAll(events)`), `Clock` (`now()`), `IdGenerator` (`next()`). El
  dominio/application dependen de **estas interfaces**; sus implementaciones
  viven en `core` (DIP). Esto es clave: el caso de uso pide "hazlo atómico" sin
  conocer Prisma.
- **VOs genéricos** (`shared/value-objects/`): `Money`, `DateRange`. Reutilizables
  por varios contextos y sin dependencia de otro dominio.
- **Decoradores/utilidades genéricas** (`shared/decorators/`, `shared/utils/`):
  helpers puros reutilizables (p. ej. tipos utilitarios, guards de tipo). Los
  decoradores atados a HTTP/seguridad (`@CurrentUser`, `@Roles`) **no** van
  aquí; van en `auth`.

> Nota: VOs **específicos de un contexto** no van en `shared`. `EmailAddress` →
> `identity`; `Corridor`/`Address`/`CountryRef`/`CityRef` → `geography` (shared
> kernel); `Capacity`/`TravelWindow` → `trips`; `ProductReference`/`OrderStatus`/
> `FulfillmentType` → `orders`; `RatingScore`/`Reputation` → `reputation`.

### 4.3 Contenido de `core/` (infra de producción que pidió el negocio)

Todo lo siguiente vive en `core/` y se registra globalmente en el bootstrap:

1. **Configuración tipada** (`core/config/`): `ConfigModule` con esquema
   validado al arrancar (falla rápido si falta una variable). Se inyecta un
   `AppConfigService` tipado; **prohibido** `process.env` disperso. Secretos vía
   entorno/secret manager (12-factor), nunca en el repo.
2. **Logging estructurado** (`core/logging/`): logger JSON (p. ej. pino), un
   log = un objeto con `requestId`, `module`, `useCase`, nivel, timestamp.
3. **Propagación de Request Id / correlation id** (`core/logging/request-context.ts`
   + `request-id.middleware.ts`): middleware que genera/lee `X-Request-Id` y lo
   guarda en un `AsyncLocalStorage` (`RequestContext`), disponible para logs,
   respuestas y llamadas salientes futuras.
4. **Filtro global de excepciones** (`core/http/filters/`): mapea
   `DomainError`/`InvariantViolationError` → 4xx de negocio, y cualquier otra →
   500 con el `requestId`, produciendo el **envelope de error** estándar. Nunca
   filtra stack traces al cliente.
5. **Interceptor de envelope de respuesta** (`core/http/interceptors/`): envuelve
   toda respuesta exitosa en el envelope estándar (`{ data, meta }` con
   `requestId`). La **forma exacta** del envelope se coordina con `api-designer`.
6. **ValidationPipe global** (`core/http/`): `whitelist`, `forbidNonWhitelisted`,
   `transform` activados a nivel app; los DTOs de entrada usan `class-validator`.
7. **Bus de eventos de dominio in-process** (`core/events/`): implementación de
   `DomainEventPublisher` sobre `@nestjs/event-emitter` (patrón observer del
   monolito). Emisores y handlers **no se conocen**; se comunican por el nombre/
   contrato del evento. **Los eventos se despachan tras el commit** de la unidad
   de trabajo (sección 5.5). *Punto de extensión futura:* transactional outbox +
   broker externo, sin cambiar la interfaz `DomainEventPublisher`.
8. **Persistencia compartida** (`core/persistence/`): un único `PrismaService`
   (un cliente para todo el proceso), `TransactionalContext` (ALS que guarda el
   `tx` activo) y la implementación de `UnitOfWork` sobre `prisma.$transaction`.
   Esta pieza es la que habilita la **frontera transaccional entre módulos**
   (sección 5.3) sin exponer Prisma al dominio.
9. **Health** (`core/health/`): endpoints de liveness/readiness (terminus) para
   probes del orquestador.
10. **`CoreModule`**: `@Global()`, registra filtros/interceptores/pipe globales,
    exporta `PrismaService`, `UnitOfWork`, `DomainEventPublisher`, `Clock`,
    `IdGenerator`, logger y config para que la `infrastructure` de cada módulo
    los inyecte.

---

## 5. Relaciones y comunicación entre módulos

### 5.1 Grafo de dependencias permitido (DAG, sin ciclos)

Una flecha `A → B` significa "A puede importar el **contrato público** de B"
(nunca sus internals). El grafo es **acíclico** por diseño.

```
        identity        geography         (hojas: no dependen de nadie de negocio)
           ▲   ▲            ▲  ▲
           │   │            │  │
   auth ───┘   └── orders ──┘  └── trips ──┐
                     ▲   ▲          ▲       │ (trips → geography, identity)
                     │   │          │       │
      incidents ─────┘   │          │       │
                         │          │       │
      reputation ────────┘          │       │
                                     │       │
                         matching ───┴───────┘   (matching → orders, trips)

   notifications ─(solo eventos)─▶ [bus]     uploads (hoja)     audit ─(solo eventos)─▶ [bus]
   admin ─(composición)─▶ orders, trips, matching, incidents, identity, reputation, geography
   core (@Global) ─────▶ visible a la infraestructura de todos
```

Orden topológico (hojas primero): `identity`, `geography`, `uploads` →
`orders` → `reputation`, `incidents` → `trips` → `matching` → `auth`,
`notifications`, `audit`, `admin`.

Observaciones clave:
- `orders` **no** depende de `trips` ni de `matching`. `trips` **no** depende de
  `orders` ni de `matching`. Los dos lados del marketplace no se acoplan.
- `matching` es **downstream** de `orders` y `trips`: es el único autorizado a
  depender de ambos, y por eso es el **hub transaccional** (5.3).
- `trips → reputation` **no** es dependencia de código: es **por evento**
  (`trips` cachea el snapshot al recibir `ReputationRecalculated`). Por eso no
  aparece como flecha de import.

### 5.2 Mecanismos de comunicación (cuándo usar cuál)

| Mecanismo | Cuándo | Acoplamiento | Consistencia |
|---|---|---|---|
| **Llamada directa a puerto publicado** (inbound API de otro módulo) | Necesito una acción/lectura **ahora**, misma transacción, y voy **a favor** del DAG (downstream) | Sincrónico, por contrato (interfaz), no por internals | Inmediata |
| **Puerto invertido (DIP)** | Necesito una acción **ahora** pero iría **contra** el DAG | Yo declaro la interfaz; el otro la implementa; binding en composition root | Inmediata (misma tx) |
| **Evento de dominio in-process** | Reacción **desacoplada**, el emisor no debe conocer al consumidor (notificaciones, auditoría, cache de reputación, re-matching) | Ninguno directo: solo el contrato del evento | Eventual (post-commit) |

**Nunca** se comparten tablas entre módulos ni un módulo hace queries a las
tablas de otro. La comunicación es **por contrato** (puertos y eventos). Esta
regla es la que habilita la extracción futura (5.6).

### 5.3 Frontera transaccional entre Orders / Assignments / Trips / Matching

El problema: `AssignTravelerToOrder`, `Accept`, `Reject`, `Expire`,
`CancelOrder`, `CancelTrip`, `RaiseDispute`, `ResolveDispute` tocan **varios
agregados de varios módulos** y deben quedar **atómicamente consistentes** (p.
ej. reservar capacidad + crear `Assignment` + mover `Order` a `ASSIGNED` es todo
o nada). Hay que lograrlo **sin** que los módulos compartan tablas ni se
acoplen a los internals del otro.

**Solución: Unit of Work compartida y re-entrante, provista por `core`,
coordinada por el módulo dueño de la operación.**

1. `core` expone `UnitOfWork` (interfaz en `shared`, impl en `core` sobre
   `prisma.$transaction`) y un `TransactionalContext` basado en
   `AsyncLocalStorage`.
2. El caso de uso coordinador envuelve todo su trabajo en
   `unitOfWork.runInTransaction(async () => { ... })`. Este método es
   **re-entrante**: si ya hay una transacción ambiente, se **une** a ella; si
   no, abre una nueva.
3. Cada repositorio Prisma resuelve su cliente como
   `transactionalContext.getClient() ?? prismaService` — es decir, **enlista
   automáticamente** en la transacción ambiente. Así, aunque el trabajo cruce
   `matching` → `orders` → `trips`, **todos los writes usan el mismo `tx`** y
   hacen commit/rollback juntos.
4. Los `domain`/`application` **no** ven Prisma: solo `UnitOfWork`. La atomicidad
   es una capacidad pedida por interfaz.

**Coordinador de cada operación (regla de propiedad):**
- `matching` coordina `Assign`/`Accept`/`Reject`/`Expire` (es downstream de
  orders y trips → llama sus `*Api` publicadas directamente, todo en una UoW).
- `orders` coordina `CancelOrder`/`ExpireOrder`; para liberar el `Assignment`
  usa el **puerto invertido** `AssignmentReleaseApi` (implementado por
  `matching`), todo dentro de la misma UoW.
- `trips` coordina `CancelTrip`; para rebotar los `Assignment`/`Order`
  afectados usa el **puerto invertido** `TripCancellationCoordinationApi`
  (implementado por `matching`).
- `incidents` coordina `RaiseDispute`/`ResolveDispute` llamando
  `OrdersCoordinationApi` (downstream), en una UoW.

Como `matching` es el único nodo que ya depende de `orders` **y** `trips`, se le
asigna el rol de **hub**: implementa los puertos invertidos de cancelación y,
dentro de ellos, llama a `TripsCapacityApi`/`OrdersCoordinationApi`. Así **todas
las flechas de código apuntan a `matching → {orders, trips}`** y no se forma
ningún ciclo (detalle en 5.4).

> Por qué inmediata y no eventual: la invariante de **no sobre-reservar
> capacidad** al asignar es dura y los tres agregados están bajo el mismo
> despliegue (decisión aprobada en `01-dominio.md` 9 y propagación 3). Por eso
> `matching` **no** se extrae a servicio en el MVP.

### 5.4 Cómo se evita el acoplamiento cíclico (inversión + composition root)

Cuando `orders` necesita liberar un `Assignment` (que es de `matching`), la
dependencia natural `orders → matching` **rompería** el DAG. Se invierte con
DIP:

```
orders/application/ports/assignment-release.api.ts   ← INTERFAZ declarada en orders
matching/infrastructure/adapters/                     ← ADAPTER que la implementa
  assignment-release.adapter.ts  (delega en ReleaseAssignmentForCancellationUseCase)
```

- El adapter (en `matching`) importa la interfaz de `orders` → flecha
  `matching → orders` (misma dirección que el resto). **No** hay
  `orders → matching`.
- El **binding** del token `ASSIGNMENT_RELEASE_API` (declarado por `orders`) a
  la implementación de `matching` se hace en el **composition root**
  (`AppModule` o un `IntegrationModule` `@Global`), que es el único autorizado a
  conocer a ambos. Ningún módulo de negocio importa a otro contra el DAG.

Regla general anti-ciclos:
1. Módulos solo importan **contratos públicos** (puertos + eventos), nunca
   `domain/`/`infrastructure/` ajenos.
2. Dependencias a favor del DAG → llamada directa al puerto publicado.
3. Dependencias contra el DAG → **invertir**: interfaz en el upstream, adapter
   en el downstream, binding en el composition root.
4. Reacciones que no requieren atomicidad → **evento**, no llamada.

### 5.5 Publicación de eventos (post-commit)

Los agregados **acumulan** eventos (`recordEvent`) al ejecutar sus transiciones.
El caso de uso, **después** de que `unitOfWork.runInTransaction` confirmó,
recoge los eventos (`pullEvents`) y los pasa a `DomainEventPublisher.publishAll`,
que los emite en el bus in-process. Los handlers (notifications, audit, cache de
reputación en trips, re-matching) reaccionan de forma desacoplada. Publicar
**tras** el commit evita notificar sobre cambios que se hicieron rollback.
*Extensión futura:* un **transactional outbox** (escribir eventos en la misma tx
y despacharlos aparte) para garantía at-least-once y para cuando algún consumidor
se extraiga a otro proceso; no es requisito del MVP.

### 5.6 Flujo completo: "Buyer crea Order → matching asigna Trip → Traveler acepta"

```
(precondición) Traveler publicó Trip:
  interface trips → PublishTripUseCase (trips) → TripRepository.save
  → emite TripPublished  ──▶ [bus] ──▶ matching (handler): "reevaluar pool de pedidos en espera"

1) Buyer crea el pedido
   HTTP POST /api/v1/orders
   → orders/interface OrdersController (v1) mapea DTO → CreateOrderCommand
   → CreateOrderUseCase (orders):
       · GeographyApi.validateCorridor(...)  + EnabledCorridorPolicy   (orders → geography)
       · FulfillmentStrategyResolver.resolve(BUYER_SHIPS_TO_TRAVELER)  (dentro de orders)
       · Order.create(...)  → status = PENDING_ASSIGNMENT
       · UnitOfWork.runInTransaction → OrderRepository.save
   → post-commit emite OrderCreated  ──▶ [bus]
       ├─▶ notifications: "pedido creado" al Buyer
       ├─▶ audit: registra evento
       └─▶ matching (handler): encola/dispara intento de asignación

2) Matching asigna un Trip  (COORDINACIÓN TRANSACCIONAL, hub = matching)
   → AssignTravelerToOrderUseCase (matching), dentro de UnitOfWork.runInTransaction:
       · TripsQueryApi.findCompatibleTrips(corridor, window)     (matching → trips)   [lee capacidad + snapshot reputación cacheado]
       · MatchingPolicy.selectBest(candidates, order)            (algoritmo = matching-engine-architect)
       · TripsCapacityApi.reserveCapacity(tripId)                (matching → trips)   [invariante reserved ≤ total]
       · Assignment.create(orderId, tripId, score, expiresAt)    (matching)           → AssignmentRepository.save
       · OrdersCoordinationApi.markAssigned(orderId, assignmentId)(matching → orders) → Order.status = ASSIGNED
     — todo con el MISMO tx; si algo falla, rollback total (no queda capacidad reservada huérfana)
   → post-commit emite TravelerAssigned + OrderAssigned + TripCapacityReserved ──▶ [bus]
       ├─▶ notifications: "tienes un pedido para aceptar" al Traveler
       └─▶ audit

3) Traveler acepta  (COORDINACIÓN TRANSACCIONAL, hub = matching)
   HTTP POST /api/v1/assignments/:id/accept
   → matching/interface AssignmentsController (v1) → AcceptAssignmentCommand
   → AcceptAssignmentUseCase (matching), dentro de UnitOfWork.runInTransaction:
       · Assignment.accept()  [guarda: PENDING_ACCEPTANCE y no expirado]  → AssignmentRepository.save
       · OrdersCoordinationApi.startSourcing(orderId)  (matching → orders) → Order.status = SOURCING
   → post-commit emite AssignmentAccepted + OrderSourcingStarted ──▶ [bus]
       ├─▶ notifications: "el Traveler aceptó" al Buyer; "inicia aprovisionamiento" al Traveler
       ├─▶ orders (handler interno): activa la sub-máquina del Fulfillment → AWAITING_PURCHASE
       └─▶ audit
```

Módulos que intervienen: `trips`, `orders`, `matching`, `geography` (validación),
`notifications`, `audit`. El Buyer **nunca** elige Traveler; matching decide. La
capacidad se **reserva** en el paso 2 y se **liberaría** en un reject/expire/
cancel (misma mecánica transaccional, hub `matching`).

### 5.7 Reglas para extraer un módulo a microservicio sin reescribir su lógica

Se cumplen desde el día uno para que la extracción sea mecánica, no un rediseño:

1. **Comunicación por contrato, no por tablas.** Ningún módulo lee/escribe
   tablas de otro. Solo puertos publicados y eventos. Al extraer, el puerto
   local se sustituye por un cliente remoto **con la misma interfaz**.
2. **Referencias por identidad, no por objeto.** Un agregado guarda `buyerId`,
   no un `Buyer` embebido (regla de dominio). Cruzar procesos no rompe grafos de
   objetos.
3. **Eventos con payload serializable y estable** (contrato versionado). El
   mismo evento in-process se convierte en mensaje de broker sin cambiar
   emisores/consumidores.
4. **La `application` no conoce el transporte.** Depende de `UnitOfWork`,
   `DomainEventPublisher` y puertos; da igual que por debajo sea Prisma+emitter
   (hoy) o SQL propio+broker (mañana).
5. **Frontera transaccional aislada en el hub.** Solo `matching` coordina la tx
   multi-agregado. Si `matching` se extrajera, esa coordinación pasa de UoW
   local a **saga** (compensaciones por evento), y **solo cambia la
   implementación del coordinador**, no `orders`/`trips`. Por eso hoy no se
   extrae: la consistencia inmediata de capacidad lo hace más simple en el MVP.

---

## 6. Extensibilidad de Fulfillment a nivel de arquitectura

### 6.1 Piezas y dónde viven (todas en `orders`, dominio puro)

```
orders/domain/fulfillment/
  fulfillment-strategy.interface.ts     ← contrato (puerto de dominio)
  fulfillment-strategy.resolver.ts      ← servicio de dominio: Map<FulfillmentType, FulfillmentStrategy>
  strategies/
    buyer-ships-to-traveler.strategy.ts ← única del MVP
orders/domain/entities/
  fulfillment.entity.ts                 ← ESTADO (type, status, datos); delega COMPORTAMIENTO en la strategy
  order.entity.ts                       ← solo conoce la ABSTRACCIÓN: fulfillment.isReadyForTransport(), handle(cmd)
```

- `FulfillmentType` (VO/enum) es el **discriminador** estable: se usa para
  resolver la strategy y para filtrar en matching.
- `FulfillmentStrategy` (interfaz de dominio) expone: la sub-máquina del tipo,
  manejadores de sus comandos, `isReadyForTransport()`,
  `requiresTravelerAssignment()`, `requiresTransport()`.
- `FulfillmentStrategyResolver` mapea `FulfillmentType → FulfillmentStrategy`.
- `Order` **nunca** hace `if (type === BUYER_SHIPS_...)`: llama a la abstracción.

### 6.2 Resolver + registro por DI (registro por `FulfillmentType`)

El resolver es dominio puro (un `Map`), pero se **construye** con las strategies
que el contenedor de NestJS inyecta:

- Un **multi-provider token** `FULFILLMENT_STRATEGIES` agrupa todas las
  strategies registradas.
- Una **factory** en `OrdersModule` construye el `FulfillmentStrategyResolver`
  con ese array; el resolver se indexa por `strategy.supports(type)`.
- Cada strategy declara qué `FulfillmentType` soporta. Agregar una es **añadir
  un provider** al token; el resolver lo recoge sin cambiar código existente
  (**OCP**).

### 6.3 Por qué agregar `WAREHOUSE_FULFILLMENT` NO toca Orders

Pasos para el nuevo tipo:

1. Añadir el valor `WAREHOUSE_FULFILLMENT` al VO `FulfillmentType` (conjunto
   cerrado; único punto de cambio, y es un dato, no lógica de `Order`).
2. Crear `warehouse-fulfillment.strategy.ts` implementando `FulfillmentStrategy`
   (su sub-máquina, `isReadyForTransport`, `requiresTransport`, etc.).
3. Registrar la strategy en el token `FULFILLMENT_STRATEGIES`.
4. Si necesita **infra externa** (WMS, stock), crear un **módulo companion**
   `fulfillment-warehouse/` con su `infrastructure` (cliente WMS detrás de un
   puerto) y que **contribuya** su strategy al token. `orders` no lo importa: el
   binding vive en el composition root.

Lo que **NO** cambia: `Order`, `Trip`, `Assignment`, sus máquinas de estado, el
backbone del pedido, ni ningún caso de uso existente. El backbone consulta a la
strategy qué fases aplican (`requiresTransport()`), de modo que un tipo sin
transporte (p. ej. `LOCAL_INVENTORY`) transita `SOURCING → DELIVERED` sin pasar
por `IN_TRANSIT`, y un tipo sin Traveler simplemente **no crea `Assignment`** —
`Trip`/`Assignment` no se tocan, solo no se usan. Esto es exactamente el
requisito de extensibilidad del día uno de `01-dominio.md`.

---

## 7. Convenciones del proyecto

Consolidan y amplían el skill `nestjs-conventions`.

### 7.1 Nombrado de archivos y clases

- Archivos: `kebab-case.tipo.ts`. Sufijos por tipo:
  - Dominio: `order.entity.ts`, `money.value-object.ts`,
    `order.repository.ts` (interfaz), `order-created.event.ts`,
    `fulfillment-strategy.interface.ts`.
  - Application: `create-order.use-case.ts`, `create-order.command.ts`,
    `get-order-detail.query.ts`, `assignment-release.api.ts` (puerto),
    `tokens.ts`.
  - Infrastructure: `prisma-order.repository.ts`, `order.mapper.ts`,
    `assignment-release.adapter.ts`, `orders.config.ts`.
  - Interface: `orders.controller.ts`, `create-order.request.dto.ts`,
    `order.response.dto.ts`, `order-http.mapper.ts`.
  - Módulo: `orders.module.ts`; contrato público: `orders.contracts.ts`.
- Clases: `PascalCase` (`CreateOrderUseCase`, `PrismaOrderRepository`).
- Interfaces de repositorio con **nombre semántico** (`OrderRepository`), impl
  con prefijo técnico (`PrismaOrderRepository`). Igual para puertos
  (`TripsCapacityApi` / adapter concreto).

### 7.2 Tokens de inyección de dependencias

- Un token por abstracción, `Symbol('X')` o `const X = Symbol('X')`, agrupados
  en `application/tokens.ts` del módulo (o del contrato público si se exporta).
- Binding en el `@Module`: `{ provide: ORDER_REPOSITORY, useClass: PrismaOrderRepository }`.
- **Prohibido** inyectar la clase concreta de infraestructura en
  `application`/`domain`. Siempre por token contra la interfaz.
- Los puertos entre módulos se inyectan por token declarado en el módulo dueño
  del contrato; los bindings inversos se hacen en el composition root.

### 7.3 DTOs

- **Entrada**: DTO en `interface/http/dto`, validado con `class-validator`. El
  controller lo mapea a un **command/query** de application (objeto plano); los
  use cases **no** reciben DTOs HTTP.
- **Salida**: `response.dto.ts` con `class-transformer`; por defecto
  `@Exclude()` a nivel de clase (`excludeExtraneousValues: true`) y `@Expose()`
  campo por campo, para **blindar** por omisión (nunca exponer hash de
  credencial, ids internos sensibles, etc.).
- **No se reutiliza** un DTO de request como response (ni viceversa) si el
  **significado** de los campos difiere, aunque coincida la forma.

### 7.4 Reglas de estilo y límites

- **Prohibido `any`** (`@typescript-eslint/no-explicit-any` en `error`); usar
  `unknown` + narrowing o tipos precisos. Excepción puntual justificada con
  comentario.
- ESLint + Prettier únicos para todo el repo, sin excepciones por módulo.
- **Import-boundaries por lint** (p. ej. `eslint-plugin-boundaries` o
  `no-restricted-imports`):
  - `domain` no importa `application`/`infrastructure`/`interface`/`core`/
    `@prisma/client`/`@nestjs/*` de infra.
  - `application` no importa `infrastructure`/`interface`/Prisma.
  - Ningún módulo importa `domain`/`infrastructure` de **otro** módulo; solo su
    `*.contracts.ts`.
  - `core` no es importado por `domain`/`application`.
  Estas reglas se ejecutan en CI (propagación a devops/qa).
- Un archivo, una responsabilidad; un controller no mezcla entidades no
  relacionadas.

### 7.5 Mapeo dominio ↔ persistencia

- Los **mappers** viven en `infrastructure/persistence/prisma/mappers/`. Traducen
  entre el modelo de persistencia (Prisma) y las entidades/VOs de dominio en
  ambos sentidos.
- Las entidades de dominio **nunca** cargan tipos de Prisma ni decoradores ORM.
  El repositorio Prisma es el único que ve ambos mundos y usa el mapper.
- Las **queries** (CQRS-light) pueden devolver read models/DTOs directamente sin
  reconstruir el agregado rico, pero siempre a través de una `QueryPort`, no con
  Prisma inline en el caso de uso.

### 7.6 Configuración y secretos

- Toda config vía `ConfigModule` tipado y validado al arrancar; `.env` fuera del
  repo, con `.env.example` versionado.
- Secretos por entorno/secret manager; jamás en código ni en logs (el logger
  redacta campos sensibles).

### 7.7 Versionado de API a nivel de arquitectura

- **URI versioning**: prefijo global `api` + versión `v1` →
  `app.setGlobalPrefix('api')` + `app.enableVersioning({ type: VersioningType.URI })`;
  controllers con `@Controller({ version: '1', path: 'orders' })` → `/api/v1/orders`.
- El versionado vive **solo en `interface`**. `application` y `domain` son
  **agnósticos a la versión**.
- Convivencia de versiones sin duplicar dominio:
  - Cambio solo de **forma de contrato** (renombrar/estructurar campos): nuevo
    controller `interface/http/v2` + nuevo `response.dto` + mapper, reutilizando
    **el mismo use case**.
  - Cambio de **comportamiento**: nuevo use case `v2`, dejando el `v1` intacto;
    el dominio no se bifurca.
  Así v2 nunca duplica agregados ni reglas: solo agrega adaptadores de
  interfaz. La **forma concreta** del versionado la afina `api-designer`.

---

## 8. Estructura completa de carpetas

### 8.1 Raíz del repositorio

```
bringo-backend/
├── src/
│   ├── main.ts                     # bootstrap: prefix api, enableVersioning(URI), pipes/filtros/interceptores globales
│   ├── app.module.ts               # composition root: importa CoreModule, SharedModule y todos los modules; bindings inversos
│   ├── core/                       # infra de framework (sección 4.3)
│   ├── shared/                     # kernel puro (sección 4.2)
│   └── modules/
│       ├── identity/
│       ├── auth/
│       ├── orders/
│       ├── trips/
│       ├── matching/
│       ├── reputation/
│       ├── incidents/
│       ├── geography/
│       ├── notifications/
│       ├── audit/
│       ├── uploads/
│       └── admin/
├── prisma/
│   ├── schema.prisma               # dueño: database-engineer
│   ├── migrations/
│   └── seed.ts                     # catálogos (countries, cities, corredores habilitados)
├── test/
│   ├── e2e/                        # flujos cross-módulo (create→assign→accept→deliver)
│   ├── fixtures/
│   └── jest-e2e.json
├── .env.example
├── .eslintrc.cjs                   # incluye reglas de import-boundaries y no-explicit-any
├── .prettierrc
├── tsconfig.json                   # paths: @core/*, @shared/*, @modules/*
├── tsconfig.build.json
├── nest-cli.json
├── package.json
├── Dockerfile
├── docker-compose.yml              # app + postgres (dev)
└── README.md
```

### 8.2 `core/` (detalle)

```
src/core/
├── config/
│   ├── config.module.ts
│   ├── configuration.ts            # carga tipada
│   ├── env.validation.ts           # valida env al arrancar (falla rápido)
│   ├── app.config.ts
│   └── database.config.ts
├── logging/
│   ├── logger.module.ts
│   ├── logger.service.ts           # JSON estructurado
│   ├── request-context.ts          # AsyncLocalStorage: requestId + tx activo
│   ├── request-id.middleware.ts    # genera/propaga X-Request-Id
│   └── logging.interceptor.ts
├── http/
│   ├── filters/
│   │   ├── all-exceptions.filter.ts
│   │   └── domain-exception.filter.ts
│   └── interceptors/
│       └── response-envelope.interceptor.ts
├── persistence/
│   ├── prisma.module.ts
│   ├── prisma.service.ts           # único cliente
│   ├── transactional-context.ts    # ALS del tx client
│   └── unit-of-work.ts             # impl de UnitOfWork (prisma.$transaction, re-entrante)
├── events/
│   ├── domain-events.module.ts
│   ├── in-process-event-bus.ts     # impl de DomainEventPublisher (event-emitter)
│   └── event-dispatcher.ts         # flush post-commit
├── health/
│   ├── health.module.ts
│   └── health.controller.ts        # /health, /health/ready
└── core.module.ts                  # @Global; exporta Prisma, UoW, publisher, clock, id-gen, logger, config
```

### 8.3 `shared/` (detalle)

```
src/shared/
├── domain/
│   ├── aggregate-root.ts           # recordEvent / pullEvents
│   ├── entity.ts
│   ├── value-object.ts
│   ├── domain-event.ts
│   ├── result.ts
│   ├── guard.ts
│   ├── ports/
│   │   ├── unit-of-work.ts         # interfaz
│   │   ├── domain-event-publisher.ts
│   │   ├── clock.ts
│   │   └── id-generator.ts
│   └── errors/
│       ├── domain.error.ts
│       └── invariant-violation.error.ts
├── value-objects/
│   ├── money.value-object.ts
│   └── date-range.value-object.ts
├── decorators/
└── utils/
```

### 8.4 Módulo representativo A: `orders/` (completo)

```
src/modules/orders/
├── domain/
│   ├── entities/
│   │   ├── order.entity.ts
│   │   ├── fulfillment.entity.ts
│   │   └── buyer-profile.entity.ts
│   ├── value-objects/
│   │   ├── order-status.value-object.ts
│   │   ├── fulfillment-status.value-object.ts
│   │   ├── fulfillment-type.value-object.ts
│   │   └── product-reference.value-object.ts
│   ├── fulfillment/
│   │   ├── fulfillment-strategy.interface.ts
│   │   ├── fulfillment-strategy.resolver.ts
│   │   └── strategies/
│   │       └── buyer-ships-to-traveler.strategy.ts
│   ├── events/
│   │   ├── order-created.event.ts
│   │   ├── order-assigned.event.ts
│   │   ├── order-sourcing-started.event.ts
│   │   ├── order-in-transit.event.ts
│   │   ├── order-delivered.event.ts
│   │   ├── order-completed.event.ts
│   │   ├── order-cancelled.event.ts
│   │   ├── order-expired.event.ts
│   │   ├── product-purchased.event.ts            # emitido por la strategy
│   │   └── package-received-by-traveler.event.ts
│   ├── repositories/
│   │   ├── order.repository.ts                   # interfaz
│   │   └── buyer-profile.repository.ts
│   ├── policies/
│   │   └── enabled-corridor.policy.ts            # dominio puro (usa dato de config/catálogo)
│   └── errors/
│       └── order-invariant.error.ts
├── application/
│   ├── ports/
│   │   ├── assignment-release.api.ts             # OUTBOUND (impl: matching)
│   │   ├── identity-access.api.ts                # consumido (impl: identity)
│   │   └── geography.api.ts                       # consumido (impl: geography)
│   ├── use-cases/
│   │   ├── create-order/
│   │   │   ├── create-order.command.ts
│   │   │   └── create-order.use-case.ts
│   │   ├── cancel-order/
│   │   │   ├── cancel-order.command.ts
│   │   │   └── cancel-order.use-case.ts
│   │   ├── confirm-purchase.use-case.ts
│   │   ├── confirm-package-received.use-case.ts
│   │   ├── mark-in-transit.use-case.ts
│   │   ├── mark-ready-for-delivery.use-case.ts
│   │   ├── confirm-delivery.use-case.ts
│   │   ├── report-delivery-failure.use-case.ts
│   │   ├── complete-order.use-case.ts
│   │   ├── expire-order.use-case.ts
│   │   ├── register-buyer-profile.use-case.ts
│   │   └── queries/
│   │       ├── get-order-detail.query.ts
│   │       ├── get-order-detail.handler.ts
│   │       └── list-buyer-orders.handler.ts
│   └── tokens.ts                                  # ORDER_REPOSITORY, ASSIGNMENT_RELEASE_API, ...
├── infrastructure/
│   ├── persistence/
│   │   └── prisma/
│   │       ├── prisma-order.repository.ts
│   │       ├── prisma-buyer-profile.repository.ts
│   │       ├── read-models/
│   │       │   └── order-detail.read-model.ts
│   │       └── mappers/
│   │           ├── order.mapper.ts
│   │           └── fulfillment.mapper.ts
│   ├── inbound/
│   │   └── orders-coordination.provider.ts        # impl de OrdersCoordinationApi (publicada)
│   └── config/
│       └── orders.config.ts
├── interface/
│   └── http/
│       ├── v1/
│       │   ├── orders.controller.ts
│       │   └── buyer-profiles.controller.ts
│       ├── dto/
│       │   ├── create-order.request.dto.ts
│       │   ├── cancel-order.request.dto.ts
│       │   ├── order.response.dto.ts
│       │   └── order-detail.response.dto.ts
│       └── mappers/
│           └── order-http.mapper.ts
├── tests/
│   ├── unit/
│   │   ├── order.entity.spec.ts
│   │   ├── fulfillment-strategy.resolver.spec.ts
│   │   └── create-order.use-case.spec.ts
│   ├── integration/
│   │   └── prisma-order.repository.spec.ts
│   └── e2e/
│       └── create-order.e2e-spec.ts
├── orders.contracts.ts             # API pública: OrdersCoordinationApi, OrdersQueryApi, tokens, contratos de eventos
└── orders.module.ts
```

### 8.5 Módulo representativo B: `matching/` (completo)

```
src/modules/matching/
├── domain/
│   ├── entities/
│   │   └── assignment.entity.ts
│   ├── value-objects/
│   │   ├── assignment-status.value-object.ts
│   │   └── match-score.value-object.ts
│   ├── services/
│   │   └── matching-policy.interface.ts          # puerto del algoritmo (dueño: matching-engine-architect)
│   ├── events/
│   │   ├── traveler-assigned.event.ts
│   │   ├── assignment-accepted.event.ts
│   │   ├── assignment-rejected.event.ts
│   │   └── assignment-expired.event.ts
│   └── repositories/
│       └── assignment.repository.ts
├── application/
│   ├── ports/
│   │   ├── orders-coordination.api.ts            # consumido (impl: orders)
│   │   ├── orders-query.api.ts                    # consumido (impl: orders)
│   │   ├── trips-capacity.api.ts                  # consumido (impl: trips)
│   │   └── trips-query.api.ts                     # consumido (impl: trips)
│   ├── use-cases/
│   │   ├── assign-traveler-to-order/
│   │   │   ├── assign-traveler-to-order.command.ts
│   │   │   └── assign-traveler-to-order.use-case.ts
│   │   ├── accept-assignment.use-case.ts
│   │   ├── reject-assignment.use-case.ts
│   │   ├── expire-assignment.use-case.ts
│   │   ├── release-assignment-for-cancellation.use-case.ts
│   │   ├── release-assignments-for-cancelled-trip.use-case.ts
│   │   └── queries/
│   │       └── get-assignment-detail.handler.ts
│   └── tokens.ts
├── infrastructure/
│   ├── persistence/
│   │   └── prisma/
│   │       ├── prisma-assignment.repository.ts
│   │       └── mappers/
│   │           └── assignment.mapper.ts
│   ├── policy/
│   │   └── default-matching-policy.ts            # placeholder; algoritmo real: matching-engine-architect
│   └── adapters/
│       ├── assignment-release.adapter.ts         # impl de orders' AssignmentReleaseApi (puerto invertido)
│       └── trip-cancellation-coordination.adapter.ts  # impl de trips' TripCancellationCoordinationApi
├── interface/
│   └── http/
│       ├── v1/
│       │   └── assignments.controller.ts         # accept / reject por el Traveler
│       └── dto/
│           ├── accept-assignment.request.dto.ts
│           └── assignment.response.dto.ts
├── tests/
│   ├── unit/
│   │   └── assignment.entity.spec.ts
│   ├── integration/
│   │   └── assign-traveler-to-order.use-case.spec.ts   # verifica rollback atómico multi-módulo
│   └── e2e/
│       └── accept-assignment.e2e-spec.ts
├── matching.contracts.ts
└── matching.module.ts
```

### 8.6 Patrón que replican los demás módulos

Todos los módulos de negocio siguen el mismo esqueleto de 4 capas +
`tests/` + `<módulo>.module.ts` + `<módulo>.contracts.ts`, ajustando el
contenido:

- **`identity/`**: `domain` (`user.entity.ts`, `email-address.value-object.ts`,
  `role.value-object.ts`, `user.repository.ts`, `user-registered.event.ts`);
  `application` (`register-user`, `grant-role`, `suspend-user`, query
  `get-user-access`); `infrastructure` (`prisma-user.repository.ts`, provider de
  `IdentityAccessApi`); `interface/http/v1` (registro). `identity.contracts.ts`
  publica `IdentityAccessApi`.
- **`trips/`**: `domain` (`trip.entity.ts`, `traveler-profile.entity.ts`,
  `capacity.value-object.ts`, `travel-window.value-object.ts`,
  `trip-status.value-object.ts`, repos, eventos `trip-published`,
  `trip-capacity-reserved/released`); `application` (`publish-trip`,
  `cancel-trip`, `reserve/release-capacity`, handler
  `update-traveler-reputation-cache` para `ReputationRecalculated`, queries de
  candidatos); `infrastructure` (repos Prisma, providers de `TripsCapacityApi`/
  `TripsQueryApi`, adapter outbound `TripCancellationCoordinationApi` declarado
  por trips). `trips.contracts.ts` publica `TripsCapacityApi`, `TripsQueryApi`.
- **`reputation/`**: `rating.entity.ts`, `rating-score.value-object.ts`,
  `reputation.value-object.ts`, use case `rate-counterpart` (+ recálculo),
  eventos `counterpart-rated`, `reputation-recalculated`; consume
  `OrdersQueryApi`/`OrdersCoordinationApi`.
- **`incidents/`**: `dispute.entity.ts`, use cases `raise-dispute`,
  `resolve-dispute`; consume `OrdersCoordinationApi`.
- **`geography/`**: `country.entity.ts`, `city.entity.ts`, VOs del shared kernel
  (`corridor`, `address`, `country-ref`, `city-ref`), queries
  (`validate-corridor`, `is-corridor-enabled`). `geography.contracts.ts` exporta
  los VOs + `GeographyApi`.
- **`notifications/`**: sin `domain` rico; `application/handlers/` con
  suscriptores a eventos; `infrastructure` con el canal de entrega detrás de un
  puerto; `notification.entity.ts` operativo.
- **`audit/`**: `application/handlers/` genérico que persiste el audit trail;
  `infrastructure/persistence`.
- **`uploads/`**: puerto `FileStorageApi` + adapter (disco/S3);
  `interface/http/v1` para subir; `uploads.contracts.ts` publica `FileStorageApi`.
- **`auth/`**: `application` (login/refresh — detalle de `security-engineer`),
  `infrastructure` (estrategias JWT, hashing), `interface/http/v1` +
  `guards/` (`jwt-auth.guard.ts`, `roles.guard.ts`) registrados como `APP_GUARD`,
  decoradores `@CurrentUser`/`@Roles`. Depende de `identity` vía
  `IdentityAccessApi`.
- **`admin/`**: solo `interface/http/v1/*` (controllers con guard de rol Admin)
  que inyectan y **componen** use cases de otros módulos. Sin `domain`.

---

## 9. Tabla de decisiones arquitectónicas (ADR)

| # | Decisión | Justificación (qué problema futuro evita) | Alternativa descartada |
|---|---|---|---|
| A1 | Monolito modular con Clean Architecture por módulo | Un solo despliegue simple hoy, con límites que permiten extraer a servicio mañana sin reescribir lógica | Microservicios desde el MVP: complejidad operativa y transaccional prematura sin beneficio |
| A2 | Repository Pattern con interfaz en `domain`, impl en `infrastructure`, binding por token | Permite cambiar Prisma por otra tecnología o mockear en tests sin tocar dominio/use cases | Inyectar Prisma directamente en use cases: acopla dominio a la DB, imposibilita tests puros |
| A3 | `identity` (dominio) y `auth` (mecanismo) separados | Roles/identidad cambian por negocio; tokens/sesión por seguridad. Facilita extraer auth y aísla el trabajo de `security-engineer` | `iam` único: mezcla concerns estables y volátiles, complica extracción |
| A4 | `BuyerProfile` en `orders`, `TravelerProfile` en `trips` (no en identity, no módulos propios) | El perfil cambia con su contexto (reputación cacheada, direcciones); evita "bolsa de gatos" en identity | Módulos `buyers`/`travelers`: anémicos y parten la lógica demanda/oferta |
| A5 | `matching` = un módulo dueño de `Assignment` (Matching+Assignments juntos) | El `Assignment` es la salida del matching; cambian juntos. Evita módulo anémico y ciclo | Separar Assignments de Matching: acoplamiento cíclico y anemia |
| A6 | `Fulfillment` como entidad interna de `Order` + Strategy en el dominio | Consistencia transaccional pedido↔fulfillment; agregar un tipo = agregar clase (OCP) | Fulfillment como agregado/módulo propio: rompería la consistencia inmediata con `Order.status` |
| A7 | `matching` como **hub transaccional**; `orders`/`trips` exponen puertos; cancelaciones vía puerto invertido | Coordina Order+Assignment+Trip en una UoW sin ciclos ni tablas compartidas; extraíble a saga después | `orders`/`trips` llamando a `matching`: ciclo de dependencias (forwardRef, code smell) |
| A8 | Unit of Work compartida y re-entrante (ALS + `prisma.$transaction`) en `core`, expuesta como interfaz | Atomicidad multi-módulo sin exponer Prisma al dominio; repos enlistan solos en la tx | Pasar el `tx` explícito por firmas: contamina las interfaces de dominio con detalle de infra |
| A9 | Eventos de dominio in-process (observer), despachados **post-commit** | Desacopla emisores de consumidores (notifications, audit, cache reputación); no notifica en rollback | Llamadas directas emisor→consumidor: acopla y obliga a recompilar al añadir consumidores |
| A10 | Comunicación entre módulos solo por **contratos** (puertos + eventos), nunca por tablas | Habilita extracción a microservicio cambiando solo la impl del puerto | Compartir tablas/queries entre módulos: acopla al schema, bloquea la extracción |
| A11 | `geography` como shared kernel de solo lectura (VOs `Corridor`/`Address` exportados) | Multi-corredor por datos; un solo lenguaje ubicuo para país/ciudad/corredor | Duplicar VOs de geografía por módulo: sinónimos sueltos e inconsistencia |
| A12 | `trips` cachea el snapshot de reputación (evento), matching lee desde trips | Evita dependencia en caliente matching→reputation y lecturas cruzadas en el hot path | matching consulta `reputation` sincrónicamente en cada asignación: acoplamiento y latencia |
| A13 | `admin` sin lógica ni agregado; solo composición | Un cambio de negocio se hace en el módulo dueño, no duplicado en admin | Admin con lógica propia: duplica invariantes y se desincroniza del dominio |
| A14 | `audit` como módulo (con estado) vs logging en `core` (sin estado) | Separa observabilidad técnica de auditoría de negocio; audit es extraíble | Meter el audit trail en `core`: mezcla infra sin estado con estado de negocio |
| A15 | Versionado URI `/api/v1` solo en `interface`; dominio agnóstico | v2 agrega controllers/DTOs (o use case nuevo), nunca duplica dominio | Versionar dentro de use cases/dominio: bifurca reglas de negocio |
| A16 | CQRS ligero (commands/queries como clases), sin buses | Simplicidad; queries pueden puentear el dominio para lectura eficiente | CommandBus/QueryBus desde el MVP: complejidad sin necesidad actual (queda como extensión) |

---

## 10. Propagaciones a otros agentes

**PROPAGAR → `database-engineer`:**
1. Un **único `PrismaService`** por proceso; transacciones vía
   `prisma.$transaction`. Los repositorios deben **enlistar en la transacción
   ambiente** (patrón `TransactionalContext` con `AsyncLocalStorage`) para que
   `UnitOfWork.runInTransaction` sea atómico y re-entrante a través de módulos.
2. **Dos niveles de estado** (`Order.status` + `Order.fulfillment.status`):
   decidir cómo persistir y cómo materializar la **proyección aplanada** y el
   `OrderStatusHistory` (a partir del audit trail de eventos).
3. **Datos específicos por `FulfillmentType`** se guardan sin que el dominio lo
   sepa (columnas nulas / tabla polimórfica / tablas por tipo); el mapper de
   `orders/infrastructure` es el único puente.
4. Cada módulo **posee** sus tablas; **no** crear dependencias cruzadas que
   impidan la extracción. Referencias entre agregados por **id**; las FKs
   cross-contexto, de existir, deben tratarse como frontera lógica blanda.
5. **Capacidad**: reserva/liberación deben ser atómicas con la creación/cambio
   del `Assignment` (invariante `reserved ≤ total`).
6. **Corredores habilitados** como catálogo/dato (seed), consultado por
   `EnabledCorridorPolicy`.
7. *Extensión futura* (no MVP): tabla de **transactional outbox** si se decide
   garantía at-least-once para eventos.

**PROPAGAR → `api-designer`:**
1. **Versionado URI** `/api/v1`; el versionado vive solo en `interface`.
2. Definir la **forma del envelope** de respuesta (éxito y error) que consume el
   `ResponseEnvelopeInterceptor` y el `AllExceptionsFilter`, incluyendo el
   `requestId`.
3. Exponer probablemente un **status aplanado** (proyección) del pedido, no los
   dos niveles internos.
4. Ecoar/propagar el header **`X-Request-Id`**.
5. Respetar el reparto de comandos por actor (p. ej. **`ConfirmDelivery` es del
   Buyer**) y que **el Buyer no elige Traveler**.
6. DTOs de salida con `@Exclude` por defecto; no reutilizar request/response con
   significado distinto; paginación para las queries de listado.

**PROPAGAR → `security-engineer`:**
1. `auth` es el módulo dueño de JWT/refresh/hashing; registra los **guards
   globales** (`APP_GUARD`) y los decoradores `@CurrentUser`/`@Roles`.
2. `identity` publica `IdentityAccessApi` (usuario, estado, roles, grant de rol);
   `auth` y `admin` la consumen. `RefreshToken`/`Session` **no** son dominio.
3. Aplicar **RBAC** mapeando comandos↔roles; hacer cumplir `User SUSPENDED`.
4. Blindar respuestas: **nunca** exponer hash de credenciales ni campos
   sensibles (via `@Exclude`).

**PROPAGAR → `matching-engine-architect`:**
1. El algoritmo se implementa detrás del puerto **`MatchingPolicy`**
   (`matching/domain/services`); el módulo `matching` ya provee la persistencia
   del `Assignment` y la coordinación transaccional (hub).
2. El filtro por **reputación** es política de matching (umbral configurable),
   leído desde el **snapshot cacheado** en `TravelerProfile` (no consulta
   `reputation` en caliente).
3. La **reserva de capacidad** ocurre en `AssignTravelerToOrder` dentro de la
   UoW; el algoritmo solo elige candidato, no persiste efectos colaterales.

**PROPAGAR → `qa`:**
1. Pirámide por módulo: **unit** (dominio/use cases con fakes), **integration**
   (repos contra DB de test), **e2e** (`test/e2e` cross-módulo).
2. Tests de **rollback atómico** para comandos multi-módulo (Assign/Cancel):
   verificar que un fallo no deja capacidad reservada huérfana.
3. **Contract tests** de los puertos públicos entre módulos y tests de
   **handlers de eventos**.
4. CI debe correr las reglas de **import-boundaries** y **no-explicit-any**.

**PROPAGAR → `devops`:**
1. Config por entorno **validada al arrancar** (falla rápido); secretos por
   secret manager; `.env.example` versionado.
2. **Docker + docker-compose** (app + Postgres) para dev; imagen única (monolito).
3. Endpoints **`/health` y `/health/ready`** para probes.
4. **Logs estructurados** con `requestId` para agregación.
5. Ejecutar en CI el lint de **límites de import** (bloquea fugas de capa/
   módulo) y `tsc` estricto.
6. *Extensión futura* señalada: outbox + broker + Redis (caché/colas) como
   puntos de crecimiento, **no** requisitos del MVP.
```
