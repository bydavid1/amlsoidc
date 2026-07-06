import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthUserView } from '../../identity/application/views/auth-user.view';
import { IdentityAccessService } from '../../identity/application/identity-access.service';
import { RefreshTokenStore } from '../infrastructure/refresh-token.store';
import { TokenService } from '../infrastructure/token.service';

export interface AuthResult {
  user: AuthUserView;
  accessToken: string;
  refreshToken: string;
}

/**
 * Casos de uso del mecanismo de autenticación. La identidad (User, roles)
 * es del módulo identity; aquí solo se orquestan credenciales y tokens.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly identityAccess: IdentityAccessService,
    private readonly tokens: TokenService,
    private readonly refreshStore: RefreshTokenStore,
  ) {}

  async register(email: string, password: string): Promise<AuthResult> {
    const user = await this.identityAccess.register({ email, password });
    return this.issueFor(user);
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.identityAccess.verifyCredentials(email, password);
    if (!user) {
      // mismo error exista o no el email (anti-enumeración)
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }
    if (user.status === 'SUSPENDED') {
      throw new UnauthorizedException({
        code: 'USER_SUSPENDED',
        message: 'User account is suspended',
      });
    }
    return this.issueFor(user);
  }

  async refresh(rawRefreshToken: string): Promise<AuthResult> {
    const { token, userId } = await this.refreshStore.rotate(rawRefreshToken);
    const user = await this.identityAccess.getAuthUser(userId);
    if (!user || user.status === 'SUSPENDED') {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'User is not allowed to refresh session',
      });
    }
    return {
      user,
      accessToken: await this.tokens.issueAccessToken(user),
      refreshToken: token,
    };
  }

  async logout(rawRefreshToken: string): Promise<void> {
    await this.refreshStore.revokeByRawToken(rawRefreshToken);
  }

  private async issueFor(user: AuthUserView): Promise<AuthResult> {
    return {
      user,
      accessToken: await this.tokens.issueAccessToken(user),
      refreshToken: await this.refreshStore.issue(user.id),
    };
  }
}
