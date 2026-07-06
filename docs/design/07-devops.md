# 07 — DevOps: Docker, Entornos, Logging y CI

> Estructura de infraestructura local y camino a producción. Los archivos aquí
> son **bocetos de diseño**; se materializan al pasar a implementación.

## 1. Docker Compose (entorno local/desarrollo)

Servicios (todos en un solo `docker-compose.yml`):

| Servicio | Rol | Nota |
|----------|-----|------|
| `api` | NestJS (build multi-stage: deps → build → runtime) | expone `PORT`; depende de `postgres` sano |
| `postgres` | PostgreSQL | volumen nombrado persistente + healthcheck `pg_isready` |
| `pgadmin` | UI de DB para dev | **solo dev**, nunca prod; credenciales por env |
| `redis` | cache/colas futuras | incluido **desde ya** aunque el MVP no lo use, para no reescribir compose después |
| `mailpit` | SMTP de pruebas | captura correos en dev; la app apunta `SMTP_HOST`/`PORT` aquí |

**Orden de arranque:** `api` depende de `postgres` con
`condition: service_healthy` (no solo `service_started`) para evitar fallos de
conexión en el primer arranque.

**Boceto:**
```yaml
services:
  api:
    build: { context: ., target: runtime }
    env_file: [.env]
    ports: ["${PORT}:${PORT}"]
    depends_on:
      postgres: { condition: service_healthy }
  postgres:
    image: postgres:16-alpine
    environment: [POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER"]
      interval: 5s
      timeout: 5s
      retries: 10
  pgadmin:   { image: dpage/pgadmin4, profiles: ["dev"] }
  redis:     { image: redis:7-alpine }
  mailpit:   { image: axllent/mailpit, ports: ["8025:8025"] }
volumes: { pgdata: }
```
`pgadmin` bajo un **profile `dev`** para no levantarlo en CI/prod por accidente.

## 2. Variables de entorno (`.env.example`)

`.env` real **nunca** se commitea; solo `.env.example` con valores vacíos/no
sensibles.

```
NODE_ENV=development
PORT=3000

DATABASE_URL=postgresql://user:password@postgres:5432/bringo?schema=public

JWT_ACCESS_SECRET=
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=
JWT_REFRESH_EXPIRES_IN=7d

REDIS_URL=redis://redis:6379
SMTP_HOST=mailpit
SMTP_PORT=1025

# Matching (ver 06-matching.md §8)
MATCH_REPUTATION_MIN=3.0
MATCH_W_TIME=0.35
MATCH_W_REPUTATION=0.30
MATCH_W_CAPACITY=0.15
MATCH_W_FAIRNESS=0.15
MATCH_W_LOAD=0.05
MATCH_ACCEPTANCE_WINDOW=30m
MATCH_MAX_REASSIGN_ATTEMPTS=5

PGADMIN_DEFAULT_EMAIL=
PGADMIN_DEFAULT_PASSWORD=
```

**Config tipada y validada al arranque** (`@nestjs/config` + esquema de
validación): si falta un secreto o los pesos del matching no suman 1, la app
**no arranca** (fail-fast) en vez de fallar en runtime.

## 3. Logging estructurado y observabilidad (requisito de producción)

- **Logger estructurado JSON** (`nestjs-pino` / `pino`): un evento = un objeto
  JSON con `timestamp`, `level`, `requestId`, `context`, `msg`. Nada de
  `console.log`.
- **Request Id / correlation id**: middleware en `core` que genera (o toma del
  header `X-Request-Id`) un id por request, lo propaga vía `AsyncLocalStorage`, lo
  incluye en todos los logs de esa request y lo ecoa en la respuesta. Permite
  rastrear un pedido de punta a punta en los logs.
- **Auditoría** (negocio): además del log técnico, las acciones sensibles y las
  transiciones de estado van a `AuditLog` en DB (ver `05-seguridad.md`).
- **Health checks**: `GET /health` (liveness) y `GET /health/ready` (readiness:
  verifica DB) para orquestadores (Docker/K8s a futuro).
- **Preparado para métricas/tracing** (OpenTelemetry) sin acoplarlo aún: el
  logger y el request-id ya dan la base de correlación.

## 4. Dockerfile (multi-stage, boceto)

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
USER node
CMD ["node", "dist/main.js"]
```
Imagen final sin dev-deps ni código fuente; corre como usuario `node` (no root).

## 5. Pipeline de CI (esqueleto, fail-fast)

Orden de etapas (cada una corta la siguiente si falla):

```
install → lint (+ límites de import + no-any) → unit tests
  → integration tests (Postgres efímero) → build
  → [futuro] e2e tests → [futuro] build & push imagen → [futuro] deploy
```

- **lint** incluye reglas de **límites de import entre módulos/capas** (que
  `domain/` no importe Prisma/NestJS-infra, que un módulo no importe el `domain`
  de otro) — la regla de dependencia se verifica en CI, no solo por convención.
- **integration tests** corren contra un Postgres efímero (servicio de CI o
  Testcontainers) con migraciones reales.
- **seguridad**: `npm audit` / Dependabot como paso no bloqueante inicialmente.

## 6. Entornos

| Entorno | DB | Swagger | PgAdmin | Secretos |
|---------|----|---------|---------|----------|
| local/dev | Postgres en compose | expuesto | expuesto (profile dev) | `.env` local |
| CI | Postgres efímero | n/a | n/a | secrets del CI |
| staging/prod | Postgres gestionado | protegido/oculto | **nunca** | secret manager |

## PROPAGAR

- **→ security-engineer:** confirmado secret manager en prod, Swagger/PgAdmin no
  públicos, TLS en el borde.
- **→ qa:** integration/e2e usan Postgres efímero; CI ejecuta unit+integration
  antes de build.
- **→ software-architect:** `core` implementa request-id (ALS), logger
  estructurado, exception filter, interceptor de envelope y health — confirmado.
