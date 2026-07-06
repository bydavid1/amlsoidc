---
name: prisma-postgres-modeling
description: >
  Consulta este skill cuando diseñes o revises el schema de Prisma y el
  modelo relacional de PostgreSQL para Bringo: relaciones, índices,
  restricciones, soft delete y campos auditables. Principal referencia de
  database-engineer.
---

# Modelado de datos — Prisma + PostgreSQL para Bringo

## Campos auditables estándar

Toda entidad relevante de negocio incluye:

```prisma
createdAt DateTime  @default(now())
updatedAt DateTime  @updatedAt
deletedAt DateTime?
```

Nunca usar borrado físico (`DELETE`) sobre entidades de negocio con
historial relevante (Order, Trip, Assignment, Rating). Reservar el borrado
físico para datos verdaderamente transitorios.

## Soft delete: reglas prácticas

- Todo query "por defecto" debe excluir `deletedAt IS NOT NULL` — implementar
  vía middleware de Prisma o un repositorio base que aplique el filtro,
  nunca confiar en que cada desarrollador lo recuerde en cada query.
- Las restricciones `@unique` que puedan chocar con soft delete (ej. email
  de usuario) deben considerar índices parciales (`WHERE deletedAt IS NULL`)
  para permitir reutilizar un valor tras un borrado lógico.

## Modelar un concepto extensible (Fulfillment) sin migraciones destructivas

Opciones y cuándo usarlas:

1. **Tabla `Fulfillment` base + discriminador `type` + tabla de detalle por
   tipo con FK 1:1** (`FulfillmentBuyerShipsToTraveler`,
   `FulfillmentWarehouse`, etc.). Recomendado cuando cada tipo tiene campos
   propios muy distintos. Agregar un tipo nuevo = nueva tabla, no ALTER de
   las existentes.
2. **Tabla única con columnas nulas por tipo**. Solo aceptable si los tipos
   comparten la mayoría de campos y son pocos; degrada con el tiempo.
3. **Columna JSON (`Json` en Prisma) para atributos específicos del tipo**,
   con el discriminador como columna normal indexada. Útil cuando la
   variabilidad es alta y no se necesita indexar/filtrar por esos campos
   específicos.

Para Bringo, con pocos tipos previstos pero con datos propios claramente
distintos (ej. dirección de compra vs. bodega vs. inventario local), la
opción 1 es la más alineada con "no modificar el dominio al agregar tipos".

## Índices — criterio de diseño

No indexar "por si acaso". Indexar según patrones de consulta reales:

- `Trip`: índice compuesto sobre (país origen, país destino, fecha llegada,
  estado) para el matching engine.
- `Order`: índice sobre (estado, país destino) para colas de trabajo y
  paneles de operación.
- `Assignment`: índice sobre (orderId) y (tripId) por separado, más un
  índice único sobre la combinación activa para evitar doble asignación.

## Restricciones como segunda línea de defensa del dominio

Ejemplo: si el dominio dice que un pedido no puede tener dos asignaciones
activas simultáneas, reforzarlo con un índice único parcial
(`WHERE status = 'ACTIVE'`) en vez de confiar solo en la lógica de
aplicación.

## Multi-país desde el modelo

`Country` y `City` como catálogos propios (no strings sueltos en Trip/Order),
para poder agregar corredores nuevos sin tocar código, solo datos.
