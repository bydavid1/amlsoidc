---
name: auth-security-owasp
description: >
  Consulta este skill al diseñar autenticación, autorización, rate limiting
  o al revisar cualquier módulo contra buenas prácticas OWASP para Bringo.
  Principal referencia de security-engineer.
---

# Seguridad de aplicación — Bringo

## Autenticación

- Access token JWT de vida corta (recomendado 15 min) firmado con secreto
  propio (`JWT_ACCESS_SECRET`), distinto del secreto de refresh.
- Refresh token de vida más larga (recomendado 7 días), almacenado del lado
  del servidor de forma que sea revocable (no basta con que expire solo).
- Rotación de refresh token en cada uso: al usar un refresh token se emite
  uno nuevo y se invalida el anterior, para detectar reuso indebido (señal
  de robo de token).

## Roles y autorización

- Roles base: `BUYER`, `TRAVELER`, `ADMIN`. Un mismo usuario puede tener más
  de un rol (una persona puede ser Buyer y Traveler a la vez).
- Guards de NestJS reutilizables: `JwtAuthGuard` (autenticación) +
  `RolesGuard` (autorización) combinables por decorador (`@Roles('ADMIN')`),
  nunca lógica de permisos duplicada dentro de cada controller.
- Autorización a nivel de recurso (ej. un Buyer solo puede ver sus propios
  pedidos) se valida en el caso de uso, no confiando solo en el guard de rol.

## Rate limiting

Aplicar límites más estrictos en endpoints sensibles:
- Login: pocos intentos por IP/usuario en ventana corta.
- Creación de pedidos / intentos de matching: límite razonable para
  prevenir abuso sin afectar el uso legítimo.

## Configuración base

- **Helmet**: habilitado globalmente con cabeceras de seguridad estándar
  (CSP puede ajustarse según necesidades de Swagger UI en desarrollo).
- **CORS**: whitelist explícita de orígenes permitidos (Web, Admin, y
  dominios de desarrollo), nunca `origin: '*'` en producción, especialmente
  al usar cookies o headers de autenticación.

## Checklist OWASP aplicado (resumen operativo)

- **Inyección**: uso exclusivo de Prisma (queries parametrizadas por
  diseño); prohibido interpolar strings en `$queryRaw`.
- **Autenticación rota**: expiración corta de access token, rotación de
  refresh token, hash de contraseñas con algoritmo lento (bcrypt/argon2).
- **Exposición de datos sensibles**: DTOs de salida nunca incluyen hash de
  contraseña, tokens, ni campos internos técnicos.
- **Control de acceso roto**: toda autorización a nivel de recurso se
  revalida en el backend, nunca se confía en que el frontend "no muestre"
  el botón.
- **Configuración de seguridad**: Swagger UI y PgAdmin nunca expuestos
  públicamente sin protección adicional en producción.
- **Logging insuficiente**: todo intento fallido de autenticación y toda
  transición de estado relevante del pedido queda registrada con
  request id para trazabilidad.
