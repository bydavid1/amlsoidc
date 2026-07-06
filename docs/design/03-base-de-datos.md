# 03 — Modelo de Base de Datos (PostgreSQL + Prisma)

> El schema es un **detalle de infraestructura**. El dominio (`01-dominio.md`) no
> lo conoce: los repositorios traducen entre agregados de dominio y modelos de
> Prisma vía *mappers* en la capa `infrastructure`. Este documento diseña la
> persistencia, no reglas de negocio.

## 1. Principios de modelado

1. **Campos auditables en toda entidad de negocio:**
   ```prisma
   createdAt DateTime  @default(now())
   updatedAt DateTime  @updatedAt
   deletedAt DateTime?          // soft delete
   ```
2. **Soft delete, no borrado físico** para entidades con historial relevante
   (`User`, `Order`, `Trip`, `Assignment`, `Rating`, `Dispute`). El borrado
   físico se reserva para datos transitorios (tokens, notificaciones caducadas).
3. **El filtro `deletedAt IS NULL` no es opcional por query:** se aplica
   centralizado (extensión/middleware de Prisma o repositorio base), nunca a
   criterio de cada desarrollador.
4. **Catálogos, no strings sueltos:** `Country`/`City` son tablas; `Trip`/`Order`
   referencian por FK. Habilitar un corredor nuevo = insertar datos, no cambiar
   código.
5. **Cada módulo posee sus tablas.** Las relaciones entre módulos se hacen por
   `id` (FK), nunca compartiendo/uniendo tablas de otro contexto en queries de
   negocio. Esto mantiene los módulos desacoplados y permite extraerlos luego.
6. **La base de datos es la segunda línea de defensa de las invariantes:** lo
   que el dominio garantiza en memoria, se refuerza con constraints (índices
   únicos parciales, checks, FKs).

## 2. Diagrama entidad–relación (visión general)

```
User ─┬─(1:1?)─ BuyerProfile ─(1:N)─ Order ─(1:1)─ Fulfillment ─(1:1)─ Fulfillment<Type>Detail
      │                                  │                │
      │                                  │                └─(1:N)─ OrderStatusHistory
      └─(1:1?)─ TravelerProfile ─(1:N)─ Trip              │
                     │                    │               └─(N:1)─ Corridor (derivado de Country/City)
                     │                    │
                     └───────────(1:N)── Assignment ──(N:1)─ Order
                                          (Trip 1:N Assignment)
User ─(1:N)─ RefreshToken           (security; ver 05)
Order ─(1:N)─ Rating (una por parte)      Country ─(1:N)─ City
Order ─(0:1)─ Dispute                      EnabledCorridor (catálogo config)
User ─(1:N)─ Notification                  AuditLog
```

Relaciones clave y su cardinalidad justificada:

| Relación | Cardinalidad | Nota |
|----------|--------------|------|
| `User` ↔ `BuyerProfile` / `TravelerProfile` | 1:0..1 cada una | Un usuario puede tener ambos perfiles o ninguno; el perfil se crea al “activar” ese rol. |
| `BuyerProfile` → `Order` | 1:N | Un Buyer crea muchos pedidos. |
| `Order` ↔ `Fulfillment` | 1:1 | Fulfillment es entidad interna del agregado Order. |
| `Fulfillment` ↔ `Fulfillment<Type>Detail` | 1:1 (por tipo) | Datos específicos por tipo, en tabla aparte (§5). |
| `Order` → `Assignment` | 1:N (solo **uno activo**) | Historial de ofertas/rechazos; único activo por índice parcial. |
| `Trip` → `Assignment` | 1:N | Un viaje puede llevar varios pedidos hasta su capacidad. |
| `Order` → `Rating` | 1:0..2 | Una calificación por parte (Buyer→Traveler y Traveler→Buyer). |
| `Order` → `Dispute` | 1:0..1 | Una disputa por pedido (MVP). |

## 3. Esquema Prisma (boceto de diseño, no implementación final)

> Enums, relaciones, índices y constraints. Se afinará al implementar; sirve
> para validar el modelo relacional.

```prisma
// ---------- Identity & Access ----------
model User {
  id            String     @id @default(uuid())
  email         String                        // único entre no borrados (índice parcial abajo)
  passwordHash  String
  status        UserStatus @default(ACTIVE)
  roles         UserRole[]                     // BUYER / TRAVELER / ADMIN (multi-rol)
  buyerProfile     BuyerProfile?
  travelerProfile  TravelerProfile?
  refreshTokens    RefreshToken[]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?
}

enum UserStatus { ACTIVE SUSPENDED }
enum UserRole   { BUYER TRAVELER ADMIN }

// ---------- Geography (catálogo) ----------
model Country {
  id        String @id @default(uuid())
  iso2      String @unique              // "US", "SV"
  name      String
  cities    City[]
}
model City {
  id        String  @id @default(uuid())
  countryId String
  country   Country @relation(fields: [countryId], references: [id])
  name      String
  @@unique([countryId, name])
}
// Corredores habilitados = configuración por datos, no código
model EnabledCorridor {
  id                    String  @id @default(uuid())
  originCountryId       String
  destinationCountryId  String
  isActive              Boolean @default(true)
  @@unique([originCountryId, destinationCountryId])
}

// ---------- Trips ----------
model TravelerProfile {
  id               String  @id @default(uuid())
  userId           String  @unique
  user             User    @relation(fields: [userId], references: [id])
  reputationScore  Decimal @default(0)   // snapshot cacheado (fuente: reputation)
  reputationCount  Int     @default(0)
  trips            Trip[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?
}
model Trip {
  id                    String     @id @default(uuid())
  travelerProfileId     String
  travelerProfile       TravelerProfile @relation(fields: [travelerProfileId], references: [id])
  originCountryId       String
  destinationCountryId  String
  destinationCityId     String?
  arrivalDate           DateTime
  totalCapacity         Int
  remainingCapacity     Int
  status                TripStatus @default(DRAFT)
  assignments           Assignment[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?

  @@index([originCountryId, destinationCountryId, arrivalDate, status]) // matching H1–H4
}
enum TripStatus { DRAFT OPEN IN_PROGRESS CLOSED CANCELLED }

// ---------- Orders + Fulfillment ----------
model BuyerProfile {
  id      String @id @default(uuid())
  userId  String @unique
  user    User   @relation(fields: [userId], references: [id])
  orders  Order[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?
}
model Order {
  id                    String      @id @default(uuid())
  buyerProfileId        String
  buyerProfile          BuyerProfile @relation(fields: [buyerProfileId], references: [id])
  originCountryId       String       // corredor solicitado
  destinationCountryId  String
  destinationCityId     String
  productName           String
  productUrl            String
  estimatedPriceAmount  Decimal
  estimatedPriceCurrency String
  requiredCapacity      Int          @default(1)
  neededBy              DateTime?
  status                OrderStatus  @default(PENDING_ASSIGNMENT)  // backbone (nivel 1)
  fulfillment           Fulfillment?
  assignments           Assignment[]
  statusHistory         OrderStatusHistory[]
  ratings               Rating[]
  dispute               Dispute?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?

  @@index([status, destinationCountryId])  // colas de operación / re-matching por corredor
}
// Backbone (nivel 1) — agnóstico al tipo de Fulfillment
enum OrderStatus {
  PENDING_ASSIGNMENT ASSIGNED SOURCING IN_TRANSIT READY_FOR_DELIVERY
  DELIVERED COMPLETED
  DELIVERY_FAILED DISPUTED           // excepciones recuperables
  CANCELLED EXPIRED                  // terminales (REFUNDED = futuro)
}

// Fulfillment base + discriminador + detalle por tipo (extensible sin ALTER)
model Fulfillment {
  id       String          @id @default(uuid())
  orderId  String          @unique
  order    Order           @relation(fields: [orderId], references: [id])
  type     FulfillmentType
  status   FulfillmentStatus                     // sub-flujo (nivel 2)
  buyerShipsDetail FulfillmentBuyerShipsDetail?   // 1:1 opcional por tipo
  // warehouseDetail FulfillmentWarehouseDetail?  // (futuro: nueva tabla, sin tocar esta)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
enum FulfillmentType {
  BUYER_SHIPS_TO_TRAVELER
  CUSTOMER_SHIPS_TO_TRAVELER TRAVELER_PURCHASES_PRODUCT
  WAREHOUSE_FULFILLMENT LOCAL_INVENTORY          // declarados, no implementados en MVP
}
enum FulfillmentStatus { AWAITING_PURCHASE PURCHASED RECEIVED_BY_TRAVELER } // MVP
model FulfillmentBuyerShipsDetail {
  id             String  @id @default(uuid())
  fulfillmentId  String  @unique
  fulfillment    Fulfillment @relation(fields: [fulfillmentId], references: [id])
  travelerAddressLine String            // dónde el Buyer envía el producto
  purchasedAt         DateTime?
  receivedByTravelerAt DateTime?
}

// Proyección de historial (para timeline y auditoría) — alimentada por eventos
model OrderStatusHistory {
  id        String   @id @default(uuid())
  orderId   String
  order     Order    @relation(fields: [orderId], references: [id])
  fromState String?
  toState   String
  actor     String?             // quién disparó la transición
  occurredAt DateTime @default(now())
  @@index([orderId, occurredAt])
}

// ---------- Matching ----------
model Assignment {
  id          String           @id @default(uuid())
  orderId     String
  order       Order            @relation(fields: [orderId], references: [id])
  tripId      String
  trip        Trip             @relation(fields: [tripId], references: [id])
  travelerProfileId String
  status      AssignmentStatus @default(OFFERED)
  scoreBreakdown Json?          // desglose auditable del matching
  offeredAt   DateTime @default(now())
  respondedAt DateTime?
  expiresAt   DateTime
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([orderId])
  @@index([tripId])
  @@index([travelerProfileId, orderId])   // H8 (no re-ofrecer a quien rechazó)
}
enum AssignmentStatus { OFFERED ACCEPTED REJECTED EXPIRED CANCELLED }

// ---------- Reputation / Incidents / Notifications / Audit ----------
model Rating {
  id        String  @id @default(uuid())
  orderId   String
  order     Order   @relation(fields: [orderId], references: [id])
  raterUserId String
  rateeUserId String
  score     Int                 // 1..5 (check en DB)
  comment   String?
  createdAt DateTime @default(now())
  deletedAt DateTime?
  @@unique([orderId, raterUserId])   // una calificación por parte y pedido
}
model Dispute {
  id        String        @id @default(uuid())
  orderId   String        @unique
  order     Order         @relation(fields: [orderId], references: [id])
  status    DisputeStatus @default(OPEN)
  reason    String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?
}
enum DisputeStatus { OPEN UNDER_REVIEW RESOLVED REJECTED }
model Notification {
  id        String  @id @default(uuid())
  userId    String
  type      String
  payload   Json
  readAt    DateTime?
  createdAt DateTime @default(now())
  @@index([userId, readAt])
}
model AuditLog {
  id        String   @id @default(uuid())
  actorUserId String?
  action    String
  entity    String
  entityId  String?
  requestId String?
  metadata  Json?
  createdAt DateTime @default(now())
  @@index([entity, entityId])
  @@index([actorUserId, createdAt])
}
model RefreshToken {   // detalle de seguridad (ver 05-seguridad.md)
  id         String   @id @default(uuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  tokenHash  String                  // se guarda el hash, nunca el token
  familyId   String                  // para rotación / detección de reuso
  expiresAt  DateTime
  revokedAt  DateTime?
  createdAt  DateTime @default(now())
  @@index([userId])
  @@index([familyId])
}
```

## 4. Índices, restricciones y su justificación

| Objeto | Índice / Constraint | Motivo |
|--------|---------------------|--------|
| `Trip` | `@@index([originCountryId, destinationCountryId, arrivalDate, status])` | Filtro duro del matching como range-scan (no full-scan). |
| `Order` | `@@index([status, destinationCountryId])` | Colas de operación y re-matching por corredor. |
| `Assignment` | **Índice único parcial**: un solo activo por Order | Refuerza en DB la invariante "un pedido, una asignación activa". Ver §6. |
| `Trip.remainingCapacity` | Decremento atómico condicional (`WHERE remaining >= n`) | Evita sobre-reserva bajo concurrencia (ver `06-matching.md` §6). |
| `Rating` | `@@unique([orderId, raterUserId])` | Impide doble calificación de la misma parte. |
| `User.email` | **Índice único parcial** `WHERE deletedAt IS NULL` | Permite reutilizar el email tras un borrado lógico (ver §6). |
| `Rating.score`, `estimatedPrice` | `CHECK` en migración | Validación en DB (1..5, ≥0) como segunda línea. |
| Todas las FK | `ON DELETE RESTRICT` (por defecto) | Con soft delete no borramos físicamente; restringir evita cascadas accidentales. |

## 5. Fulfillment extensible sin migraciones destructivas

Se elige la **opción 1** del skill `prisma-postgres-modeling`: tabla
`Fulfillment` base + discriminador `type` + **una tabla de detalle 1:1 por
tipo**.

- Coherente con la decisión de dominio (Fulfillment por *Strategy*): cada tipo
  tiene su tabla de detalle igual que tiene su strategy.
- **Agregar `WAREHOUSE_FULFILLMENT` = crear `FulfillmentWarehouseDetail` nueva**;
  no se hace `ALTER` de `Order`, `Trip`, `Assignment` ni de las tablas de detalle
  existentes. Cumple el requisito "no modificar el dominio al agregar tipos".
- Se descarta la tabla única con columnas nulas (degrada al crecer los tipos) y
  la columna JSON pura (los datos de compra/dirección sí se consultan/filtran).

## 6. Soft delete y constraints únicos: la trampa clásica

Un `@unique` normal sobre `email` impediría que un usuario borrado libere su
email. Solución: **índice único parcial** creado por migración SQL cruda
(Prisma lo permite vía `migration.sql`):

```sql
CREATE UNIQUE INDEX user_email_active_unique
  ON "User"(email) WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX assignment_active_per_order_unique
  ON "Assignment"("orderId") WHERE status IN ('OFFERED','ACCEPTED');
```

El segundo es la **red de seguridad de la invariante de asignación única**: aun
si la lógica de aplicación fallara, Postgres rechaza el segundo assignment
activo.

## 7. Estado de dos niveles en la persistencia

El estado del pedido es **dos columnas**, no un enum plano:

- `Order.status` → backbone (nivel 1), agnóstico al tipo de Fulfillment.
- `Fulfillment.status` → sub-flujo (nivel 2), específico del tipo.

La "vista aplanada" que consume el cliente (`04-api.md`) es una **proyección**
calculada, no una tercera columna que haya que mantener sincronizada. Esto es lo
que permite añadir tipos de Fulfillment con sub-flujos distintos sin tocar el
enum de `Order`.

## 8. Migraciones y multi-corredor

- Migraciones versionadas con `prisma migrate` (nunca editar la DB a mano en
  ambientes compartidos).
- **Seed** de catálogos: `Country`, `City` iniciales y `EnabledCorridor`
  `US→SV`. Abrir `ES→SV` o `MX→GT` en el futuro = insertar filas en
  `EnabledCorridor` + `City`, **cero cambios de código ni de schema**.

## PROPAGAR

- **→ api-designer:** el `status` expuesto es una proyección de dos columnas;
  los listados grandes (`Order`, `Trip`) usan paginación por cursor sobre
  `(createdAt, id)` — conviene índice para el cursor si el volumen lo pide.
- **→ security-engineer:** `RefreshToken` guarda `tokenHash` + `familyId` (no el
  token en claro); `passwordHash` nunca sale en DTOs; `AuditLog` lleva `requestId`.
- **→ matching-engine-architect:** confirmados el índice compuesto de `Trip`, el
  decremento atómico de capacidad y el índice único parcial de assignment activo.
- **→ qa:** tests de integración deben correr migraciones sobre Postgres efímero
  (Testcontainers) y verificar los índices parciales y el filtro de soft delete.
