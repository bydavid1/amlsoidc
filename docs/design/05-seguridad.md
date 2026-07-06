# 05 — Seguridad (Auth, Autorización, OWASP)

> El módulo `auth` es el **mecanismo** (JWT, refresh, guards); el módulo
> `identity` es el **dominio** (User, roles, status). Separados a propósito:
> cambian por razones distintas (seguridad vs. negocio).

## 1. Autenticación (JWT + Refresh Tokens)

| Token | Vida | Secreto | Almacenamiento |
|-------|------|---------|----------------|
| **Access token (JWT)** | corto (**15 min**) | `JWT_ACCESS_SECRET` | no se persiste; el cliente lo manda en `Authorization: Bearer` |
| **Refresh token** | largo (**7 días**) | `JWT_REFRESH_SECRET` (distinto del de access) | **hash** en DB (`RefreshToken.tokenHash`), revocable server-side |

**Rotación con detección de reuso:** cada uso de refresh emite uno nuevo e
invalida el anterior (misma `familyId`). Si llega un refresh ya usado/revocado
de una familia → se **revoca toda la familia** (señal de robo de token) y se
fuerza re-login. Esto es lo que hace que un refresh robado no sea eternamente
utilizable.

**Contraseñas:** hash con algoritmo lento y con sal — **argon2id** (o bcrypt
cost ≥ 12). Nunca se guarda ni se loguea la contraseña en claro.

> `RefreshToken`/`Session` son detalle de seguridad, **no** del dominio
> (confirmado por domain-architect).

## 2. Autorización (RBAC + a nivel de recurso)

- **Roles base:** `BUYER`, `TRAVELER`, `ADMIN`. Un mismo `User` puede tener
  varios (una persona puede ser Buyer y Traveler con una sola cuenta).
- **Dos guards combinables** (definidos en `auth`, registrados como `APP_GUARD`
  globales en `core`, con `@Public()` para exceptuar login/register/health):
  - `JwtAuthGuard` — valida el access token y carga `req.user`.
  - `RolesGuard` — lee `@Roles('ADMIN')` y compara con los roles del usuario.
- **Autorización a nivel de recurso** (que un Buyer solo vea *sus* pedidos): se
  valida **en el caso de uso**, no solo en el guard de rol. El guard dice "eres
  Buyer"; el caso de uso dice "eres el dueño *de este* pedido". Nunca se confía
  en que el frontend "no muestre el botón".
- **Enforcement de `SUSPENDED`:** un usuario suspendido no pasa `JwtAuthGuard`
  para acciones transaccionales, aunque su token siga vigente.
- Decoradores auxiliares: `@CurrentUser()` (inyecta el usuario), `@Roles(...)`,
  `@Public()`.

## 3. Rate limiting

`@nestjs/throttler` con límites diferenciados:

| Endpoint | Límite (sugerido) | Motivo |
|----------|-------------------|--------|
| `POST /auth/login` | estricto por IP+usuario (p. ej. 5 / 5 min) | anti fuerza bruta / credential stuffing |
| `POST /auth/register`, `/auth/refresh` | estricto por IP | anti abuso |
| `POST /orders`, disparos de matching | límite razonable por usuario | anti abuso sin frenar uso legítimo |
| resto | límite global por IP | base |

## 4. Configuración base de red

- **Helmet** habilitado globalmente (cabeceras de seguridad estándar). La CSP se
  ajusta para permitir Swagger UI **solo** en desarrollo.
- **CORS**: whitelist **explícita** de orígenes (Web, Admin, dominios de dev).
  Nunca `origin: '*'` en producción, especialmente con tokens/headers de auth.
- **HTTPS/TLS** terminado en el proxy/borde; la app asume tráfico interno cifrado.
- Secretos por variable de entorno / secret manager, **nunca** en el repo;
  validación de config al arrancar (falla rápido si falta un secreto).

## 5. Checklist OWASP aplicado

| Riesgo OWASP | Mitigación en Bringo |
|--------------|----------------------|
| **Inyección** | Solo Prisma (queries parametrizadas por diseño). Prohibido interpolar strings en `$queryRaw`. |
| **Autenticación rota** | Access corto + refresh rotado con detección de reuso + hash argon2/bcrypt + rate limit en login. |
| **Exposición de datos sensibles** | DTOs de salida con `@Exclude` por defecto; jamás se serializa `passwordHash`, tokens ni campos internos. |
| **Control de acceso roto** | Autorización de recurso revalidada en el backend (caso de uso), no en el cliente. |
| **Mala configuración** | Helmet + CORS whitelist; Swagger UI y PgAdmin nunca públicos sin protección en prod. |
| **Componentes vulnerables** | `npm audit` / Dependabot en CI (ver `07-devops.md`). |
| **Logging insuficiente** | Todo intento de auth fallido y toda transición de estado del pedido queda en `AuditLog` con `requestId` (trazabilidad). |
| **SSRF** | La `productUrl` del pedido se **almacena/valida como texto**, nunca se descarga desde el backend sin lista blanca; ninguna función hace fetch a URLs arbitrarias del usuario. |
| **IDOR** | IDs opacos (uuid) + validación de propiedad en cada caso de uso. |

## 6. Auditoría de seguridad

- `AuditLog` (ver `03-base-de-datos.md`) registra: login exitoso/fallido, cambio
  de roles, suspensión de usuario, y **cada transición de estado relevante** del
  pedido (quién, cuándo, `requestId`).
- Estos registros son inmutables (append-only); un `ADMIN` los consulta, no los
  edita.

## PROPAGAR

- **→ api-designer:** endpoints públicos (`login`, `register`, `refresh`,
  `health`, catálogos, Swagger dev) marcados `@Public()`; el resto exige
  `JwtAuthGuard`. `403` (rol/dueño) vs `401` (sin/expirado token) bien
  diferenciados en el envelope.
- **→ database-engineer:** `RefreshToken` guarda `tokenHash`+`familyId`;
  `passwordHash` fuera de todo DTO; `AuditLog` con `requestId`.
- **→ devops:** secretos por env/secret manager, validados al arranque; Swagger y
  PgAdmin protegidos en entornos no locales; TLS en el borde.
- **→ qa:** tests de que un Buyer no accede a pedidos de otro (403), de rotación
  y reuso de refresh token, y de rate limit en login.
