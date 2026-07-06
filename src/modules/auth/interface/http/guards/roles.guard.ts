import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser, Role } from '../../../../../shared/auth/authenticated-user';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../../../../../shared/auth/decorators';

/**
 * Guard global de autorización por rol (@Roles). La autorización a nivel de
 * RECURSO (dueño del pedido/viaje) se valida en cada caso de uso, nunca aquí.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();

    if (!user || !required.some((role) => user.roles.includes(role))) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: `Requires role: ${required.join(' | ')}`,
      });
    }
    return true;
  }
}
