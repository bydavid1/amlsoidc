# 04 — Diseño de la API REST (API First + OpenAPI/Swagger)

> La API es el **centro del sistema**: Web, Flutter, Panel Admin e integraciones
> consumen exactamente el mismo contrato. Ningún cliente tiene endpoints
> privilegiados "por fuera". La API se diseña primero (contrato) y el código la
> implementa, no al revés.

## 1. Versionado

- Todas las rutas bajo **`/api/v1/...`** (versionado por URI, aplicado solo en la
  capa `interface`).
- Un *breaking change* implica **`/api/v2`** conviviendo con `v1` durante una
  ventana de transición. Nunca se muta `v1` de forma incompatible en silencio.
- Se elige versionado por URI (no por header) por ser el más explícito y
  cacheable para clientes móviles y terceros.

## 2. Envelope de respuesta estándar

Todas las respuestas —éxito y error— comparten forma, para que los clientes
programen un solo parser.

**Éxito:**
```json
{ "success": true, "data": { }, "meta": { "requestId": "..." } }
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "ORDER_NOT_MATCHABLE",
    "message": "No compatible trip was found for this order",
    "details": []
  },
  "meta": { "requestId": "..." }
}
```

- `code` = identificador **estable** contra el que programa el cliente (no contra
  `message`, que puede cambiar de redacción o idioma).
- `requestId` va en `meta` y también en el header `X-Request-Id` (correlación con
  logs, ver `07-devops.md`).
- El envelope lo aplica un **interceptor global** (éxito) + un **exception filter
  global** (error) definidos en `core/` — los controllers devuelven datos
  crudos, no arman el envelope a mano.

## 3. Catálogo de códigos de error

| HTTP | Cuándo | `code` (ejemplos) |
|------|--------|-------------------|
| 400 | Validación de entrada (class-validator) | `VALIDATION_ERROR` (con `details` por campo) |
| 401 | Sin token / token inválido o expirado | `UNAUTHENTICATED` |
| 403 | Autenticado pero sin permiso (rol o dueño del recurso) | `FORBIDDEN` |
| 404 | Recurso inexistente o no visible para el solicitante | `NOT_FOUND` |
| 409 | Conflicto de estado / transición inválida de la máquina de estados | `INVALID_STATE_TRANSITION`, `ASSIGNMENT_ALREADY_ACTIVE` |
| 422 | Regla de negocio incumplible | `ORDER_NOT_MATCHABLE`, `TRIP_CAPACITY_EXCEEDED`, `CORRIDOR_NOT_ENABLED` |
| 429 | Rate limit excedido | `RATE_LIMITED` |
| 500 | Error interno | `INTERNAL_ERROR` (nunca expone stack/queries) |

- Errores de negocio usan códigos **específicos**, no genéricos: el cliente
  móvil puede reaccionar distinto a `ORDER_NOT_MATCHABLE` vs `TRIP_CAPACITY_EXCEEDED`.
- Los 500 jamás filtran detalles internos.

## 4. Diseño orientado a casos de uso, no a CRUD

La **máquina de estados vive en el dominio**; el cliente no decide estados
arbitrarios con un `PATCH`. Por eso preferimos endpoints-acción:

| ✅ Acción de negocio | ❌ Anti-patrón |
|----------------------|----------------|
| `POST /trips/:id/publish` | `PATCH /trips/:id {status:"OPEN"}` |
| `POST /orders/:id/cancel` | `PATCH /orders/:id {status:"CANCELLED"}` |
| `POST /assignments/:id/accept` | `PATCH /assignments/:id {status:"ACCEPTED"}` |
| `POST /orders/:id/confirm-delivery` | `PATCH /orders/:id {status:"DELIVERED"}` |

Cada acción mapea a un caso de uso (`02-arquitectura.md`) y la transición la
valida el dominio. El cliente no puede saltar estados aunque lo intente.

## 5. Paginación, filtros y ordenamiento

**Paginación:**
- **Cursor** para listados que crecen sin límite y reciben escritura concurrente
  (`Order`, `Trip`, `Assignment`, `Notification`). Params: `limit`, `cursor`.
  Respuesta: `meta.nextCursor` (null si no hay más).
- **Offset** solo para catálogos pequeños y estables (`Country`, `City`). Params:
  `page`, `pageSize`. Respuesta: `meta.totalItems`, `meta.totalPages`.

**Filtros:** query params explícitos y documentados por endpoint, no un lenguaje
genérico tipo GraphQL-en-REST. Ej:
`GET /api/v1/orders?status=PENDING_ASSIGNMENT&destinationCountry=SV`.

**Ordenamiento:** `sortBy` + `sortDir` (`asc`/`desc`), con whitelist de campos
ordenables por endpoint (no se permite ordenar por cualquier columna).

## 6. Convenciones de DTOs

- **DTOs de entrada** validados con `class-validator` (`@IsUUID`, `@IsEnum`,
  `@IsUrl`, `@Min`, etc.); `ValidationPipe` global con `whitelist: true` y
  `forbidNonWhitelisted: true` (descarta/rechaza campos no declarados).
- **DTOs de salida** con `class-transformer`: `@Exclude()` por defecto a nivel de
  clase y `@Expose()` selectivo, para **blindar** campos sensibles
  (`passwordHash`, tokens, ids internos) — nunca se serializa una entidad cruda.
- Un DTO **no** se reutiliza entre request y response si el significado difiere,
  aunque coincida la forma.
- Todo DTO de salida documentado con `@ApiProperty({ example })`.

## 7. Catálogo de endpoints del MVP (agrupado por módulo/`@ApiTags`)

### Auth (`@ApiTags('Auth')`)
| Método | Ruta | Caso de uso | Auth |
|--------|------|-------------|------|
| POST | `/api/v1/auth/register` | Registrar usuario | público |
| POST | `/api/v1/auth/login` | Login → access+refresh | público (rate-limit estricto) |
| POST | `/api/v1/auth/refresh` | Rotar refresh token | refresh token |
| POST | `/api/v1/auth/logout` | Revocar sesión | bearer |
| GET  | `/api/v1/auth/me` | Perfil del usuario autenticado | bearer |

### Users / Profiles (`@ApiTags('Users')`)
| POST | `/api/v1/users/me/buyer-profile` | Activar rol Buyer | bearer |
| POST | `/api/v1/users/me/traveler-profile` | Activar rol Traveler | bearer |
| GET  | `/api/v1/users/me` | Datos + perfiles | bearer |

### Trips (`@ApiTags('Trips')`)
| POST | `/api/v1/trips` | Crear viaje (DRAFT) | TRAVELER |
| POST | `/api/v1/trips/:id/publish` | Publicar (→OPEN, dispara re-matching) | TRAVELER (dueño) |
| POST | `/api/v1/trips/:id/cancel` | Cancelar viaje | TRAVELER (dueño) |
| GET  | `/api/v1/trips` | Listar viajes propios (filtros+cursor) | TRAVELER |
| GET  | `/api/v1/trips/:id` | Detalle | TRAVELER (dueño) / ADMIN |

### Orders (`@ApiTags('Orders')`)
| POST | `/api/v1/orders` | Crear pedido (dispara matching) | BUYER |
| GET  | `/api/v1/orders` | Listar pedidos propios (filtros+cursor) | BUYER |
| GET  | `/api/v1/orders/:id` | Detalle + estado aplanado + timeline | BUYER (dueño) / ADMIN |
| POST | `/api/v1/orders/:id/confirm-purchase` | Buyer confirma compra del producto | BUYER (dueño) |
| POST | `/api/v1/orders/:id/confirm-delivery` | **Buyer** confirma entrega | BUYER (dueño) |
| POST | `/api/v1/orders/:id/cancel` | Cancelar (según estado) | BUYER (dueño) |
| POST | `/api/v1/orders/:id/report-issue` | Abrir disputa | BUYER/TRAVELER |

### Assignments (`@ApiTags('Assignments')`) — el Traveler responde ofertas
| GET  | `/api/v1/assignments` | Ofertas/asignaciones del Traveler | TRAVELER |
| POST | `/api/v1/assignments/:id/accept` | Aceptar oferta | TRAVELER (destinatario) |
| POST | `/api/v1/assignments/:id/reject` | Rechazar oferta | TRAVELER (destinatario) |
| POST | `/api/v1/assignments/:id/mark-received` | Paquete recibido por el Traveler | TRAVELER |
| POST | `/api/v1/assignments/:id/mark-in-transit` | Traveler viajando | TRAVELER |

> El Buyer **no** ve ni elige candidatos: no existe `GET /orders/:id/candidates`.
> El matching es interno; el Buyer solo observa el estado de su pedido.

### Ratings (`@ApiTags('Ratings')`)
| POST | `/api/v1/orders/:id/ratings` | Calificar a la contraparte (tras DELIVERED) | BUYER/TRAVELER |

### Locations (`@ApiTags('Locations')`)
| GET | `/api/v1/countries` | Catálogo países (offset) | público |
| GET | `/api/v1/countries/:id/cities` | Ciudades de un país (offset) | público |
| GET | `/api/v1/corridors` | Corredores habilitados | público |

### Uploads (`@ApiTags('Uploads')`)
| POST | `/api/v1/uploads` | Subir comprobante/foto (multipart) | bearer |

### Admin (`@ApiTags('Admin')`) — solo composición con permisos elevados
| GET | `/api/v1/admin/orders` | Todos los pedidos (filtros) | ADMIN |
| POST | `/api/v1/admin/disputes/:id/resolve` | Resolver disputa | ADMIN |
| POST | `/api/v1/admin/users/:id/suspend` | Suspender usuario | ADMIN |

### Health (`@ApiTags('Health')`)
| GET | `/api/v1/health` | Liveness | público |
| GET | `/api/v1/health/ready` | Readiness (DB, etc.) | público |

## 8. Swagger / OpenAPI desde el día 1

- Un **`@ApiTags` por módulo** (agrupación en la UI).
- Cada endpoint documenta `@ApiOperation`, `@ApiResponse` por cada código posible
  (201/200, 400, 401, 403, 404, 409/422, 429) y **ejemplos reales** de payload.
- **JWT integrado**: `@ApiBearerAuth()` + esquema de seguridad global definido una
  sola vez en el bootstrap de Swagger (`addBearerAuth`). El botón "Authorize" de
  Swagger UI permite probar endpoints autenticados.
- DTOs de salida anotados con `@ApiProperty({ example })`; nunca se deja que
  Swagger infiera tipos sin anotar.
- Documento OpenAPI exportable (JSON) para generar SDKs de Flutter/Web y para
  terceros → refuerza API First.
- En producción, Swagger UI protegido/no expuesto públicamente (ver `05-seguridad.md`).

## 9. Ejemplo de contrato (crear pedido)

`POST /api/v1/orders`
```json
{
  "productName": "iPhone 15 Pro",
  "productUrl": "https://apple.com/...",
  "estimatedPrice": { "amount": 1099.00, "currency": "USD" },
  "originCountry": "US",
  "destinationCountry": "SV",
  "destinationCity": "<cityId>",
  "neededBy": "2026-08-15"
}
```
`201 Created`
```json
{
  "success": true,
  "data": {
    "id": "ord_...",
    "status": "PENDING_ASSIGNMENT",
    "corridor": { "origin": "US", "destination": "SV" },
    "createdAt": "2026-07-06T15:00:00Z"
  },
  "meta": { "requestId": "req_..." }
}
```
`422` si el corredor no está habilitado:
```json
{ "success": false,
  "error": { "code": "CORRIDOR_NOT_ENABLED",
             "message": "Corridor US->AR is not enabled yet", "details": [] },
  "meta": { "requestId": "req_..." } }
```

## PROPAGAR

- **→ security-engineer:** todos los endpoints marcados `bearer`/rol necesitan
  `JwtAuthGuard` + `RolesGuard`; la autorización a nivel de recurso (dueño) se
  valida en el caso de uso, no solo en el guard. `login`/`register`/`refresh`
  requieren rate limiting específico.
- **→ qa:** contract tests contra el OpenAPI; E2E de los flujos-acción y de los
  guards (403 al acceder a recurso ajeno).
- **→ devops:** exponer `/health` y `/health/ready`; ecoar `X-Request-Id`.
