import { createParamDecorator, CustomDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { AuthenticatedUser, Role } from './authenticated-user';

export const IS_PUBLIC_KEY = 'isPublic';
/** Exceptúa un endpoint de los guards globales de autenticación. */
export const Public = (): CustomDecorator => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
/** Requiere al menos uno de los roles indicados (RolesGuard). */
export const Roles = (...roles: Role[]): CustomDecorator => SetMetadata(ROLES_KEY, roles);

/** Inyecta el usuario autenticado en el handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  },
);
