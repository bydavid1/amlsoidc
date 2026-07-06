---
name: ddd-modular-monolith
description: >
  Consulta este skill siempre que se diseñe o revise la estructura de un
  módulo de NestJS para Bringo, se decida en qué capa vive una regla, o se
  evalúe si un cambio de negocio (como un nuevo tipo de Fulfillment) rompe la
  independencia del dominio. Cubre: capas de Clean Architecture, cómo se
  traducen a carpetas de NestJS, y cómo mantener módulos independientes
  dentro de un monolito.
---

# DDD + Clean Architecture en un monolito modular NestJS

## Las 4 capas por módulo

1. **Domain** — entidades, value objects, agregados, interfaces de
   repositorio, eventos de dominio, reglas de negocio puras. Sin imports de
   NestJS, Prisma, ni HTTP. Debe poder testearse sin levantar nada.
2. **Application (use cases)** — orquesta el dominio para cumplir un caso de
   uso concreto ("CreateOrder", "AssignTravelerToOrder"). Depende de
   interfaces del dominio, nunca de implementaciones concretas.
3. **Infrastructure** — implementaciones concretas: repositorios con Prisma,
   clientes externos, adaptadores de mensajería. Implementa las interfaces
   definidas en domain.
4. **Interface (HTTP)** — controllers, DTOs, guards específicos del módulo.
   Traduce HTTP a llamadas a casos de uso y viceversa.

## Regla de dependencia

Las flechas de dependencia SIEMPRE apuntan hacia adentro:
`interface → application → domain ← infrastructure`.
Domain no depende de nada de las otras tres.

## Cómo detectar que el dominio se está filtrando

Señales de alerta a vigilar en cualquier módulo:
- Un archivo en `domain/` que importa `@prisma/client` o un decorador de
  NestJS de infraestructura (`@Injectable` está bien si es solo DI, pero
  nunca `@Controller`, `@Entity` de TypeORM, etc.).
- Un caso de uso que arma directamente una query SQL/Prisma en vez de
  llamar a un repositorio con nombre de negocio (`findCompatibleTrips`, no
  `findMany({ where: {...} })` inline).
- Reglas de negocio escritas dentro de un controller "porque era más
  rápido".

## Extensibilidad sin romper el dominio (caso Fulfillment)

Cuando un concepto de negocio va a tener variantes futuras (como los tipos
de Fulfillment de Bringo), dos patrones habituales:

- **Strategy/Polimorfismo en el dominio**: una interfaz `FulfillmentStrategy`
  con un método `execute(order): FulfillmentResult`, y una implementación
  concreta por tipo. El caso de uso no sabe qué tipo es, solo invoca la
  estrategia resuelta.
- **Tabla de catálogo + discriminador en infraestructura**: el dominio solo
  ve un `FulfillmentType` como value object; la persistencia decide cómo
  guardar los datos específicos de cada tipo (columnas nulas, tabla
  polimórfica o tablas separadas con FK), sin que el dominio lo sepa.

Regla de decisión: si dos tipos de Fulfillment comparten flujo pero difieren
en detalles de datos → catálogo + discriminador. Si difieren en el flujo de
negocio en sí (pasos distintos) → Strategy en el dominio.

## Módulos: cuándo separar vs. cuándo agrupar

- Separa si dos conceptos pueden cambiar por razones distintas (ej. Trips
  cambia por reglas de viajes, Matching cambia por reglas de asignación:
  son módulos distintos aunque colaboren).
- Agrupa si dos conceptos siempre cambian juntos y uno no tiene sentido sin
  el otro (ej. Order y OrderItem suelen vivir en el mismo módulo).
- Un módulo "Admin" transversal no debe contener lógica de negocio propia;
  solo compone casos de uso ya existentes de otros módulos con permisos
  elevados.
