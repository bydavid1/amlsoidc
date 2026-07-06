import { Module } from '@nestjs/common';
import { RegisterUserUseCase } from './application/use-cases/register-user.use-case';
import { IdentityAccessService } from './application/identity-access.service';
import { USER_REPOSITORY } from './domain/repositories/user.repository';
import { PASSWORD_HASHER } from './domain/services/password-hasher';
import { PrismaUserRepository } from './infrastructure/persistence/prisma/prisma-user.repository';
import { Argon2PasswordHasher } from './infrastructure/services/argon2-password-hasher';
import { UsersController } from './interface/http/controllers/users.controller';

@Module({
  controllers: [UsersController],
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    RegisterUserUseCase,
    IdentityAccessService,
  ],
  // API publicada del módulo: otros módulos consumen SOLO IdentityAccessService
  exports: [IdentityAccessService],
})
export class IdentityModule {}
