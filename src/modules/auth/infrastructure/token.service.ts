import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EnvironmentVariables } from '../../../core/config/env.validation';
import { AuthUserView } from '../../identity/application/views/auth-user.view';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  roles: string[];
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  issueAccessToken(user: AuthUserView): Promise<string> {
    const payload: AccessTokenPayload = { sub: user.id, email: user.email, roles: user.roles };
    return this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN', { infer: true }),
    });
  }

  verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwt.verifyAsync<AccessTokenPayload>(token, {
      secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
    });
  }
}
