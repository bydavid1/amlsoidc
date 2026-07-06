---
name: nestjs-conventions
description: >
  Consulta este skill cuando definas o revises la estructura de carpetas,
  nombrado de archivos, o convenciones de estilo del proyecto NestJS de
  Bringo. Útil para software-architect y nestjs-developer al organizar
  módulos, y para mantener consistencia entre módulos creados en momentos
  distintos.
---

# Convenciones del proyecto NestJS — Bringo

## Estructura de carpetas por módulo

```
src/
  modules/
    orders/
      domain/
        entities/
        value-objects/
        repositories/          (interfaces)
        events/
      application/
        use-cases/
        dto/                   (DTOs internos entre capas, si aplican)
      infrastructure/
        persistence/
          prisma/               (implementación de repositorios)
      interface/
        http/
          controllers/
          dto/                  (DTOs de request/response HTTP)
          guards/
      tests/
        unit/
        integration/
        e2e/
      orders.module.ts
```

## Nombrado

- Archivos: `kebab-case.tipo.ts` (ej. `create-order.use-case.ts`,
  `order.repository.ts`, `order.entity.ts`, `order-response.dto.ts`).
- Clases: `PascalCase` (ej. `CreateOrderUseCase`, `OrderRepository`).
- Interfaces de repositorio en el dominio: prefijo semántico, no técnico
  (`OrderRepository` como interfaz; `PrismaOrderRepository` como
  implementación).
- Tokens de inyección de dependencias: `Symbol` o constante exportada
  específica (`ORDER_REPOSITORY`), nunca inyectar la clase concreta de
  infraestructura directamente en application/domain.

## Módulos transversales sugeridos (a validar con software-architect)

- `shared/` — value objects genéricos (Money, DateRange), decoradores
  comunes, pipes de validación reutilizables, envelope de respuesta.
- `core/` — configuración, logger, manejo global de excepciones, filtros.

## Estilo de código

- ESLint + Prettier con reglas ya acordadas para el equipo, sin excepciones
  módulo por módulo.
- Prohibido `any` salvo excepción justificada y comentada.
- Un archivo, una responsabilidad: evitar controllers con múltiples
  entidades no relacionadas.

## DTOs

- Un DTO nunca se reutiliza entre request y response si sus campos difieren
  en significado, aunque coincidan en forma.
- Todo DTO de entrada usa `class-validator`; todo DTO de salida puede usar
  `class-transformer` (`@Exclude`/`@Expose`) para blindar campos sensibles.
