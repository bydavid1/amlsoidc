import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthenticatedUser } from '../../../../../shared/auth/authenticated-user';
import { IS_PUBLIC_KEY } from '../../../../../shared/auth/decorators';
import { IdentityAccessService } from '../../../../identity/application/identity-access.service';
import { TokenService } from '../../../infrastructure/token.service';

/**
 * Guard global de autenticación. Verifica el JWT y recarga el usuario desde
 * identity (enforcement de SUSPENDED en caliente, no confiando solo en el
 * token de 15 min). @Public() exceptúa endpoints.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly identityAccess: IdentityAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const token = this.extractBearer(request);
    if (!token) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Missing access token',
      });
    }

    let userId: string;
    try {
      const payload = await this.tokens.verifyAccessToken(token);
      userId = payload.sub;
    } catch {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Invalid or expired access token',
      });
    }

    const user = await this.identityAccess.getAuthUser(userId);
    if (!user) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'User no longer exists',
      });
    }
    if (user.status === 'SUSPENDED') {
      throw new ForbiddenException({
        code: 'USER_SUSPENDED',
        message: 'User account is suspended',
      });
    }

    request.user = user;
    return true;
  }

  private extractBearer(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header) return undefined;
    const [scheme, token] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' ? token : undefined;
  }
}
