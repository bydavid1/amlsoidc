---
name: docker-compose-stack
description: >
  Consulta este skill al diseñar el docker-compose.yml y las variables de
  entorno del backend de Bringo. Principal referencia de devops-engineer.
---

# Stack de Docker Compose — Bringo (entorno local/desarrollo)

## Servicios esperados

- **api** — contenedor de NestJS, build multi-stage (deps → build →
  runtime), expone el puerto configurado vía `PORT`.
- **postgres** — PostgreSQL, con volumen nombrado persistente y healthcheck
  (`pg_isready`).
- **pgadmin** — solo para desarrollo, nunca en producción; credenciales por
  variable de entorno, nunca hardcodeadas.
- **redis** — incluido desde ya aunque no se use en el MVP, para no
  reescribir compose cuando se necesite (cache, colas futuras).
- **mailpit** — servidor SMTP de pruebas para no enviar correos reales en
  desarrollo; la app apunta su `SMTP_HOST`/`SMTP_PORT` a este servicio.

## Orden de arranque

`api` debe depender de `postgres` con `condition: service_healthy`, no solo
`condition: service_started`, para evitar errores de conexión en el primer
arranque.

## Variables de entorno mínimas (`.env.example`)

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

PGADMIN_DEFAULT_EMAIL=
PGADMIN_DEFAULT_PASSWORD=
```

`.env` real nunca se commitea; solo `.env.example` con valores vacíos o de
ejemplo no sensibles.

## Pipeline de CI (esqueleto, sin implementar todavía)

Etapas sugeridas en orden: `install` → `lint` → `unit tests` →
`integration tests` (contra Postgres efímero) → `build` → (futuro) `e2e
tests` → (futuro) `build & push imagen` → (futuro) `deploy`.

Cada etapa debe poder fallar rápido (fail-fast) antes de invertir tiempo en
las siguientes.
