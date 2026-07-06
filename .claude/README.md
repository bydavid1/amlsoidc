# Equipo de agentes para el backend de Bringo

Este paquete contiene **agentes** (formato `.claude/agents/*.md`, compatible
con Claude Code) y **skills** (`.claude/skills/*/SKILL.md`) para diseñar el
backend de Bringo siguiendo la filosofía API First + DDD + Clean
Architecture + monolito modular descrita en el prompt original.

No implementan el dominio, la arquitectura ni el código: son la
**estructura del equipo** que luego lo hace, cada uno con su rol,
responsabilidades y límites claros.

## Instalación (Claude Code)

```
tu-proyecto/
  .claude/
    agents/     ← copiar aquí el contenido de agents/
    skills/     ← copiar aquí el contenido de skills/
```

Con eso, Claude Code reconocerá cada agente por su `name` y lo invocará
automáticamente cuando la tarea coincida con su `description`, o puedes
invocarlos explícitamente.

## Agentes incluidos

| Orden | Agente                      | Cuándo usarlo |
|-------|------------------------------|----------------|
| 1 | `tech-lead-orchestrator`      | Punto de entrada para cualquier tarea; decide a quién delegar. |
| 2 | `domain-architect`            | Entidades, agregados, invariantes, máquina de estados. |
| 3 | `software-architect`          | Capas, módulos, SOLID, Repository Pattern. |
| 4 | `database-engineer`           | Prisma + PostgreSQL: tablas, índices, soft delete. |
| 5 | `api-designer`                | Endpoints, DTOs, Swagger, paginación, errores. |
| 6 | `matching-engine-architect`   | Algoritmo de asignación viaje-pedido. |
| 7 | `security-engineer`           | JWT, refresh tokens, roles, OWASP. |
| 8 | `devops-engineer`             | Docker Compose, variables de entorno, CI. |
| 9 | `qa-testing-engineer`         | Estrategia de unit/integration/E2E. |
| 10 | `nestjs-developer`           | Implementación de código, solo con diseño ya aprobado. |

## Skills incluidos

| Skill | Para qué agente(s) es la referencia principal |
|-------|-----------------------------------------------|
| `ddd-modular-monolith` | domain-architect, software-architect, nestjs-developer |
| `nestjs-conventions` | software-architect, nestjs-developer |
| `prisma-postgres-modeling` | database-engineer |
| `openapi-swagger-standards` | api-designer |
| `bringo-domain-knowledge` | todos — fuente única de verdad del negocio |
| `docker-compose-stack` | devops-engineer |
| `auth-security-owasp` | security-engineer |

## Flujo de trabajo recomendado

1. Invoca `tech-lead-orchestrator` con el requerimiento general.
2. Deja que delegue en orden: dominio → arquitectura → base de datos →
   API → matching → seguridad → DevOps → testing.
3. Solo al final, con todo el diseño validado, invoca `nestjs-developer`
   para pasar a código.
4. Cualquier cambio de negocio futuro (nuevo país, nuevo tipo de
   Fulfillment) debe pasar primero por `domain-architect` antes de tocar
   base de datos, API o código.
