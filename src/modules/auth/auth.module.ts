import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { IdentityModule } from '../identity/identity.module';
import { AuthService } from './application/auth.service';
import { RefreshTokenStore } from './infrastructure/refresh-token.store';
import { TokenService } from './infrastructure/token.service';
import { AuthController } from './interface/http/controllers/auth.controller';
import { JwtAuthGuard } from './interface/http/guards/jwt-auth.guard';
import { RolesGuard } from './interface/http/guards/roles.guard';

/**
 * Módulo de MECANISMO de autenticación (JWT, refresh, guards). El dominio de
 * identidad (User, roles) vive en identity — separados porque cambian por
 * razones distintas (docs/design/02-arquitectura.md).
 */
@Module({
  imports: [JwtModule.register({}), IdentityModule],
  controllers: [AuthController],
  providers: [
    TokenService,
    RefreshTokenStore,
    AuthService,
    // guards globales: primero autentica, luego autoriza por rol
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
