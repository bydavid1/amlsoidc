# 08 — Estrategia de Testing

> La arquitectura en capas **existe, en parte, para poder testear**. El dominio
> puro se prueba sin levantar nada; la infraestructura se prueba contra
> dependencias reales efímeras. Herramientas: **Jest**, **@nestjs/testing**,
> **supertest**, **Testcontainers** (Postgres efímero).

## 1. Pirámide de pruebas (muchas unitarias, pocas E2E)

```
        /\        E2E (pocas)        → API real vía HTTP, flujos completos
       /  \
      /----\      Integration (medias) → repos Prisma, eventos, transacciones
     /------\
    /--------\    Unit (muchas)       → dominio puro + casos de uso con mocks
```

## 2. Qué se prueba en cada capa

### Unit — Domain (la mayoría, las más rápidas)
- Entidades, value objects y agregados **sin infraestructura** (sin Prisma, sin
  NestJS, sin HTTP). Si necesitas levantar algo para testear el dominio, el
  dominio está mal aislado.
- Foco: **invariantes y máquina de estados**. Ej.: `Order` rechaza transición
  `PENDING_ASSIGNMENT → DELIVERED` (salto ilegal); `Trip` rechaza asignar por
  encima de la capacidad; reputación bajo umbral excluye candidato.
- El **scoring del matching** se testea aquí como función pura y **determinista**:
  mismos datos → mismo ganador y mismo desglose (incluye los desempates).

### Unit — Application (casos de uso)
- Cada caso de uso con **repositorios y puertos mockeados** (dobles de las
  interfaces del dominio). Se verifica orquestación, eventos emitidos y
  precondiciones, no la persistencia real.
- Ej.: `CreateOrderUseCase` emite `OrderCreated`; `AcceptAssignmentUseCase`
  mueve la Order a `ASSIGNED` y reserva capacidad (contra mocks).

### Integration
- **Repositorios Prisma** contra **Postgres efímero** (Testcontainers): que el
  mapper dominio↔persistencia y las queries funcionan, que el **filtro de soft
  delete** aplica, y que los **índices únicos parciales** rechazan duplicados
  (segundo assignment activo, email reusado).
- **Transaccionalidad multi-módulo**: `AssignTravelerToOrder` /
  `CancelOrder` hacen commit/rollback atómico de `Order`+`Assignment`+`Trip`
  (prueba clave por la frontera transaccional del `matching` hub).
- **Handlers de eventos**: al emitir `OrderStatusChanged` se crea la fila en
  `OrderStatusHistory` y se genera la `Notification`.
- **Contract tests de puertos**: que `PrismaOrderRepository` cumple el contrato
  de la interfaz `OrderRepository` del dominio.

### E2E (pocas, alto valor)
- Contra la **API real** por HTTP (supertest sobre la app Nest completa +
  Postgres efímero).
- **Flujo feliz completo del MVP**: register → login → Traveler publica Trip →
  Buyer crea Order → matching ofrece → Traveler acepta → confirm-purchase →
  mark-received → mark-in-transit → **Buyer** confirm-delivery → ambos califican
  → COMPLETED.
- **Guards y autorización**: 401 sin token, 403 al tocar recurso ajeno (un Buyer
  no ve pedidos de otro), rol insuficiente.
- **Auth**: rotación de refresh token y revocación de familia al detectar reuso.
- **Envelope y errores**: forma estándar de éxito/error, `requestId` presente,
  códigos de negocio correctos (`CORRIDOR_NOT_ENABLED`, `ORDER_NOT_MATCHABLE`).

## 3. Organización de archivos (según `nestjs-conventions`)

Cada módulo lleva sus pruebas junto a su código:
```
modules/orders/tests/
  unit/          # dominio + casos de uso (mocks)
  integration/   # repos Prisma, eventos, transacciones
  e2e/           # flujos de la API de ese módulo
```
Los E2E de flujos que cruzan módulos (el flujo feliz completo) viven en un
`test/e2e/` de raíz.

## 4. Convenciones y herramientas de apoyo

- **Test data builders / factories**: builders de dominio (`anOrder().pending()`)
  para armar estados sin duplicar setup y sin acoplar tests a la forma de Prisma.
- **Nombrado**: `*.spec.ts` (unit/integration) y `*.e2e-spec.ts` (E2E).
- **Determinismo**: nada de dependencias de reloj real ni aleatoriedad sin
  inyectar (`Clock`/`IdGenerator` como puertos mockeables) — crítico para el
  matching.
- **Coverage con criterio**: umbral alto en `domain/` y `application/` (la lógica
  de negocio), relajado en `interface/`/`infrastructure` (donde E2E/integration
  dan más señal). No perseguir 100% global por vanidad.

## 5. Integración con CI

Orden en el pipeline (ver `07-devops.md`): `lint → unit → integration
(Postgres efímero) → build → [futuro] e2e`. Unit e integration corren en cada
push; E2E puede reservarse a merges a la rama principal por costo.

## PROPAGAR
- **→ devops:** CI necesita Postgres efímero para integration/e2e y ejecutar
  migraciones antes de esos tests.
- **→ software-architect:** confirmar puertos `Clock`/`IdGenerator` inyectables
  para determinismo de tests.
