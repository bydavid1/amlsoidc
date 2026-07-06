# Bringo — Diseño del Backend (documento maestro)

Plataforma logística colaborativa que conecta **Buyers** con **Travelers** que
regresan de otros países. El sistema **asigna automáticamente** el mejor Traveler
(el Buyer no elige). Corredor inicial **US → SV**, arquitectura preparada para
**cualquier corredor país-a-país** por datos.

**Filosofía:** API First · DDD · Clean Architecture · SOLID · Repository Pattern ·
monolito modular (sin microservicios todavía, pero con costuras para extraerlos).
**Stack:** NestJS · TypeScript · PostgreSQL · Prisma · Swagger/OpenAPI · JWT +
Refresh · Docker/Compose · class-validator/-transformer · ESLint/Prettier.

## Índice de documentos de diseño

| # | Documento | Cubre entregables |
|---|-----------|-------------------|
| 01 | [Dominio](01-dominio.md) | 1 (dominio), máquina de estados, Fulfillment |
| 02 | [Arquitectura](02-arquitectura.md) | 2 (casos de uso), 3 (arquitectura), 4 (módulos), 5 (relaciones), 8 (convenciones), 9 (estructura de carpetas) |
| 03 | [Base de datos](03-base-de-datos.md) | 6 (modelo ER + Prisma) |
| 04 | [API REST](04-api.md) | 7 (API + Swagger) |
| 05 | [Seguridad](05-seguridad.md) | Seguridad / OWASP |
| 06 | [Matching](06-matching.md) | Motor de asignación |
| 07 | [DevOps](07-devops.md) | Docker, logging, CI |
| 08 | [Testing](08-testing.md) | Unit / Integration / E2E |
| 00 | (este) | 10 (roadmap), 11 (riesgos), 12 (crecimiento) |

---

## Los 12 entregables, en orden

### 1. Análisis del dominio → [01-dominio.md](01-dominio.md)
Bounded contexts (Identity, Ordering, Trips, Matching, Reputation, Incidents,
Geography, Notifications). **Agregados**: `User`, `BuyerProfile`,
`TravelerProfile`, `Order` (con `Fulfillment` interno), `Trip`, `Assignment`,
`Rating`, `Dispute`, `Notification`, catálogos `Country`/`City`. Decisiones
clave: `Route` → VO `Corridor`; `User` (identidad) separado de perfiles;
Fulfillment como **Strategy** de dominio; **máquina de estados de dos niveles**
(backbone del `Order` + sub-flujo del `Fulfillment`). Brecha señalada: **no
existe contexto Payments** (fuera de MVP).

### 2. Casos de uso principales → [02-arquitectura.md](02-arquitectura.md#casos-de-uso)
Formalizados en la capa `application` por módulo (commands vs queries), con
actor, agregados que tocan, eventos y si son transaccionales. Núcleo del MVP:
`Register/Login`, `PublishTrip`, `CreateOrder`, `AssignTravelerToOrder`,
`Accept/RejectAssignment`, `ConfirmPurchase`, `MarkReceived`, `MarkInTransit`,
`ConfirmDelivery` (Buyer), `RateCounterpart`, `Cancel*`.

### 3. Arquitectura general → [02-arquitectura.md](02-arquitectura.md)
Clean Architecture, 4 capas por módulo (`domain / application / infrastructure /
interface`), regla de dependencia hacia adentro, Repository Pattern con
interfaces en `domain` e implementación Prisma en `infrastructure`, DI por
tokens, SOLID aplicado. **Unit of Work re-entrante** (AsyncLocalStorage +
`prisma.$transaction`) para la atomicidad multi-módulo sin filtrar Prisma al
dominio.

### 4. Módulos del sistema → [02-arquitectura.md](02-arquitectura.md#módulos)
Negocio: `identity`, `orders`, `trips`, `matching`, `reputation`, `incidents`,
`geography`, `notifications`. Composición: `auth`, `admin`, `audit`, `uploads`.
Transversales (no módulos): `core/`, `shared/`. Decisiones justificadas: Auth ≠
Users; perfiles Buyer/Traveler viven en su contexto (no módulos aparte);
Matching+Assignments juntos; Fulfillment no es módulo (Strategy dentro de
`orders`); Admin sin lógica propia.

### 5. Relaciones entre módulos → [02-arquitectura.md](02-arquitectura.md#relaciones)
DAG sin ciclos, `matching` como hub coordinador (único que depende de `orders` y
`trips`), comunicación por **casos de uso publicados + eventos de dominio
in-process**, cancelaciones por **puertos invertidos (DIP)**. Nada de tablas
compartidas entre módulos.

### 6. Modelo de base de datos → [03-base-de-datos.md](03-base-de-datos.md)
ER + boceto Prisma completo, relaciones y cardinalidades, índices por patrón de
consulta real (matching, colas), **soft delete** con índices únicos **parciales**
(email reusable, un solo assignment activo por orden), campos auditables
(`createdAt/updatedAt/deletedAt`), Fulfillment **base + discriminador + detalle
por tipo** (agregar tipo = tabla nueva, sin ALTER), multi-corredor por catálogo.

### 7. Diseño de la API REST → [04-api.md](04-api.md)
`/api/v1`, **envelope** estándar de éxito/error con `code` estable y `requestId`,
paginación **cursor** (Order/Trip) vs **offset** (catálogos), filtros/orden
explícitos, endpoints **orientados a acción** (`POST /orders/:id/confirm-delivery`)
para respetar la máquina de estados, catálogo de endpoints por módulo, Swagger
con JWT integrado y ejemplos desde el día 1.

### 8. Convenciones del proyecto → [02-arquitectura.md](02-arquitectura.md#convenciones)
Nombrado `kebab-case.tipo.ts` / `PascalCase`, tokens de DI (`Symbol`/const, nunca
clase concreta de infra en application/domain), DTOs entrada (class-validator) vs
salida (class-transformer + `@Exclude`), prohibición de `any`, mappers
dominio↔persistencia en `infrastructure`, versionado solo en `interface`.

### 9. Estructura de carpetas NestJS → [02-arquitectura.md](02-arquitectura.md#estructura)
Árbol completo del repo (`src/modules/<módulo>/{domain,application,infrastructure,
interface,tests}`, `core/`, `shared/`, `prisma/`, `test/`, config raíz), con
`orders/` y `matching/` detallados como patrón a replicar.

### 10. Roadmap técnico del MVP
Ver §Roadmap más abajo.

### 11. Riesgos de arquitectura
Ver §Riesgos más abajo.

### 12. Recomendaciones para crecer sin reescribir
Ver §Crecimiento más abajo.

---

## 10. Roadmap técnico del MVP

Orden por dependencias, cada hito entrega valor verificable y deja la costura
para el siguiente. **No** se implementa código hasta cerrar el diseño (este
paquete).

| Hito | Contenido | Depende de |
|------|-----------|------------|
| **H0 — Fundaciones** | Scaffold NestJS, `core/` (config validada, logger + request-id, exception filter, envelope interceptor, health), `shared/` (VOs, UoW), Prisma + Postgres en Docker, Swagger vacío, ESLint/Prettier + reglas de límites de import en CI. | — |
| **H1 — Identity & Auth** | `identity` (User, roles, status) + `auth` (register/login, JWT access+refresh con rotación, guards globales, rate limit login). | H0 |
| **H2 — Geografía y corredores** | Catálogos `Country`/`City` + `EnabledCorridor` (seed US→SV). Endpoints de catálogo. | H0 |
| **H3 — Trips** | `TravelerProfile`, publicar/cancelar viaje, capacidad, estados del Trip. | H1, H2 |
| **H4 — Orders + Fulfillment** | `BuyerProfile`, crear pedido, backbone de estados + sub-flujo `BUYER_SHIPS_TO_TRAVELER`, `OrderStatusHistory` por eventos. | H1, H2 |
| **H5 — Matching + Assignments** | Motor determinista (filtros+score), ciclo del `Assignment` (offer/accept/reject/expire), reserva atómica de capacidad, UoW multi-módulo, disparadores por evento. | H3, H4 |
| **H6 — Flujo de entrega** | confirm-purchase → mark-received → mark-in-transit → **confirm-delivery (Buyer)** → COMPLETED; notificaciones reactivas. | H5 |
| **H7 — Ratings & Reputation** | Calificación mutua post-DELIVERED, snapshot de reputación que realimenta el matching. | H6 |
| **H8 — Incidents (básico)** | `report-issue` / `Dispute` OPEN + gestión mínima por Admin. | H6 |
| **H9 — Hardening** | Auditoría completa, cobertura de tests (unit+integration+e2e del flujo feliz), Helmet/CORS prod, Swagger/PgAdmin protegidos, `npm audit` en CI. | todos |

**Notas de secuencia:** H2 puede ir en paralelo a H1; H7/H8 en paralelo tras H6.
`notifications`, `audit` y `uploads` se integran de forma incremental por eventos
desde H4 en adelante.

---

## 11. Riesgos de arquitectura (y mitigación)

| # | Riesgo | Impacto | Mitigación |
|---|--------|---------|------------|
| R1 | **Acoplamiento transaccional en el hub `matching`** (toca Order+Trip+Assignment en una tx) | Dificulta extraer `matching` a servicio | UoW aislada + coordinación por puertos publicados; si se extrae, UoW→saga cambiando solo el coordinador (documentado). Aceptado a cambio de consistencia inmediata simple en MVP. |
| R2 | **Complejidad de la máquina de estados de dos niveles** | Bugs de sincronización backbone↔sub-flujo | Transiciones solo en el dominio + eventos; estado aplanado como proyección (no columna a mantener); tests de invariantes de transición. |
| R3 | **Ausencia de contexto Payments** | El flujo real (Buyer paga, escrow, reembolsos, `REFUNDED`) no está modelado | Señalado explícitamente; `REFUNDED` reservado; **decisión de negocio requerida** antes de prometer dinero. El diseño deja el hueco sin contaminar el dominio actual. |
| R4 | **Escalabilidad del matching** con muchos viajes/órdenes | Latencia/lock contention | Índice compuesto por corredor+fecha+estado, trabajo acotado por corredor, cota de candidatos, camino a colas por corredor sin tocar el scoring. |
| R5 | **Eventos de dominio in-process (EventEmitter)** no son durables | Pérdida de notificación/auditoría si el proceso cae entre commit y handler | Patrón **Outbox** como evolución (documentado): persistir el evento en la misma tx y publicarlo aparte. En MVP, acciones críticas (historial de estado) se escriben en la misma tx, no solo por evento. |
| R6 | **Soft delete + unicidad** | Emails/asignaciones "fantasma" bloqueando o duplicando | Índices únicos **parciales** (`WHERE deletedAt IS NULL` / `status activo`) + filtro central de soft delete. |
| R7 | **Snapshot de reputación cacheado en `TravelerProfile`** puede quedar obsoleto | Matching con reputación vieja | Actualización por evento `RatingCreated`; la fuente de verdad es `reputation`; tolerancia de ligera obsolescencia aceptable para el matching. |
| R8 | **Fugas de dominio** (Prisma/NestJS en `domain`, reglas en controllers) | Erosión de la Clean Architecture con el tiempo | Regla de límites de import **verificada en CI** (no solo convención), revisión en PR, repositorios con nombres de negocio. |
| R9 | **Multi-rol (Buyer+Traveler en un User)** | Bugs de autorización (auto-asignación, ver datos ajenos) | Filtro `traveler != buyer` en matching (H7); autorización de recurso revalidada en cada caso de uso. |

---

## 12. Recomendaciones para crecer sin reescribir

1. **Mantener el dominio puro** es la inversión que más protege el futuro: si
   `domain/` nunca importa Prisma/NestJS/HTTP, cambiar de ORM, de framework de
   transporte o extraer un servicio no toca las reglas de negocio. Verificarlo en
   CI, no confiarlo a la disciplina.
2. **Comunicación entre módulos por contratos y eventos, nunca por tablas
   compartidas.** Es lo que permite que un módulo se convierta en microservicio
   reemplazando el transporte, sin reescribir su lógica.
3. **Adoptar el patrón Outbox** cuando se introduzca un broker (Redis/Kafka): los
   eventos de dominio ya existen; solo cambia cómo se publican. Migración
   incremental, no big-bang.
4. **Fulfillment por Strategy + tabla de detalle por tipo**: `WAREHOUSE_FULFILLMENT`,
   `LOCAL_INVENTORY`, etc. se agregan como nueva strategy + nueva tabla + (si
   aplica) nueva `MatchingPolicy`, **sin tocar `Order`, `Trip` ni `Assignment`**.
   Es el requisito explícito del negocio y el diseño lo cumple.
5. **Corredores y catálogos como datos**: abrir `ES→SV`, `MX→GT`, etc. es
   insertar filas en `EnabledCorridor`/`City`, cero código. La internacionalización
   geográfica ya está resuelta a nivel de modelo.
6. **Versionado de API real**: `/api/v2` conviviendo con `/api/v1` para no romper
   apps móviles ya publicadas (los clientes móviles no se actualizan al instante).
7. **CQRS ligero cuando los reads duelan**: hoy commands y queries comparten
   modelo; el envelope y los casos de uso ya distinguen ambos, así que introducir
   read models/proyecciones dedicadas (p. ej. para paneles admin) es aditivo.
8. **Introducir Payments como contexto nuevo**, no como campos sueltos en `Order`:
   escrow, cobros y reembolsos son su propio bounded context que se integra por
   eventos con Ordering. Modelarlo así evita contaminar el dominio actual.
9. **Escalar el monolito antes de partirlo**: réplicas de lectura de Postgres,
   Redis para cache/colas, y colas por corredor para el matching cubren mucho
   crecimiento **sin** microservicios. Partir solo cuando un módulo tenga un
   perfil de escalado o de equipo genuinamente distinto (candidato natural:
   `matching` o `notifications`).
10. **Observabilidad desde el día 1** (request-id + logs estructurados +
    auditoría) para poder diagnosticar a escala; añadir métricas/tracing
    (OpenTelemetry) es luego un add-on, no un rediseño.

---

### Estado del diseño

Diseño (entregables 1–12) **completo y coherente**. Pendiente de decisión de
**negocio**: el contexto **Payments** (cobros/escrow/reembolsos) antes de pasar a
código. Con el diseño aprobado, el siguiente paso sería invocar `nestjs-developer`
para implementar el hito **H0** del roadmap.
