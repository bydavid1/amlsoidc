---
name: openapi-swagger-standards
description: >
  Consulta este skill al diseñar endpoints, DTOs, formato de respuestas/
  errores, paginación o documentación Swagger para la API de Bringo.
  Principal referencia de api-designer.
---

# Estándares de API REST y Swagger — Bringo

## Versionado

Todas las rutas bajo `/api/v1/...`. Un cambio incompatible (breaking change)
implica `/api/v2/...` conviviendo con v1 durante un período de transición, no
una modificación silenciosa de v1.

## Envelope de respuesta estándar

Éxito:
```json
{
  "success": true,
  "data": { },
  "meta": { }
}
```

Error:
```json
{
  "success": false,
  "error": {
    "code": "ORDER_NOT_MATCHABLE",
    "message": "No compatible trip was found for this order",
    "details": []
  }
}
```

- `code` es un identificador estable pensado para que el cliente programe
  contra él (no contra el `message`, que puede cambiar de redacción).
- Errores de validación (400) listan cada campo inválido en `details`.
- Errores de negocio (409/422 según el caso) usan códigos de negocio
  específicos, no genéricos.
- Errores de sistema (500) nunca exponen detalles internos (stack traces,
  queries) en la respuesta.

## Paginación

Usar paginación por cursor para listados que crecen sin límite claro y
pueden recibir escritura concurrente (ej. `Order`, `Trip`), y paginación por
offset solo para catálogos pequeños y estables (`Country`, `City`).

Parámetros estándar: `limit`, `cursor` (o `page`/`pageSize` para offset),
`sortBy`, `sortDir`. Respuesta incluye `meta.nextCursor` o
`meta.totalPages`/`meta.totalItems` según el modo.

## Filtros

Convención de query params explícitos y documentados por endpoint
(`?status=WAITING_ASSIGNMENT&destinationCountry=SV`), evitando un lenguaje
de query genérico tipo GraphQL-en-REST salvo que se justifique aparte.

## Swagger

- Cada módulo tiene su propio `@ApiTags('Orders')`.
- Cada endpoint documenta: `@ApiOperation`, `@ApiResponse` por cada código
  posible (200/201, 400, 401, 403, 404, 409), y ejemplos reales de payload.
- Autenticación JWT integrada vía `@ApiBearerAuth()` a nivel de controller o
  endpoint, con el esquema de seguridad global configurado una sola vez en
  el bootstrap de Swagger.
- DTOs de salida documentados con `@ApiProperty` incluyendo ejemplos, nunca
  dejar que Swagger infiera tipos sin anotar.

## Diseño orientado a casos de uso, no a CRUD genérico

Preferir endpoints que reflejen acciones de negocio sobre PATCH genéricos:

- `POST /orders/:id/accept` en vez de `PATCH /orders/:id` con un body que
  cambia el estado.
- `POST /trips/:id/publish` en vez de crear el Trip ya "publicado" por
  defecto.

Esto mantiene la máquina de estados del dominio como única fuente de verdad
sobre qué transiciones son válidas, en vez de dejar que el cliente HTTP
decida arbitrariamente el nuevo estado.
