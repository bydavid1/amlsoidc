import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../../shared/domain/domain-error';
import { User, UserRole } from '../domain/entities/user.entity';
import { USER_REPOSITORY, UserRepository } from '../domain/repositories/user.repository';
import { PASSWORD_HASHER, PasswordHasher } from '../domain/services/password-hasher';
import { RegisterUserCommand, RegisterUserUseCase } from './use-cases/register-user.use-case';
import { AuthUserView } from './views/auth-user.view';

/**
 * API publicada del módulo identity (docs/design/02-arquitectura.md):
 * lo ÚNICO que otros módulos (auth) pueden consumir. Nunca expone la
 * entidad de dominio ni el passwordHash.
 */
@Injectable()
export class IdentityAccessService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    private readonly registerUser: RegisterUserUseCase,
  ) {}

  register(command: RegisterUserCommand): Promise<AuthUserView> {
    return this.registerUser.execute(command);
  }

  async getAuthUser(userId: string): Promise<AuthUserView | null> {
    const user = await this.users.findById(userId);
    return user ? this.toView(user) : null;
  }

  /** Devuelve la vista solo si las credenciales son válidas (anti-enumeración: null en ambos casos). */
  async verifyCredentials(email: string, password: string): Promise<AuthUserView | null> {
    const user = await this.users.findByEmail(email.trim().toLowerCase());
    if (!user) {
      return null;
    }
    const valid = await this.hasher.verify(user.passwordHash, password);
    return valid ? this.toView(user) : null;
  }

  /** Otorga un rol (activación de perfil Buyer/Traveler). Idempotente. */
  async grantRole(userId: string, role: UserRole): Promise<AuthUserView> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new DomainError('NOT_FOUND', 'User not found', 'NOT_FOUND');
    }
    user.addRole(role);
    await this.users.save(user);
    return this.toView(user);
  }

  /** Suspensión por Admin: bloquea toda acción transaccional al instante (guard relee de DB). */
  async suspendUser(userId: string): Promise<AuthUserView> {
    const user = await this.requireUser(userId);
    user.suspend();
    await this.users.save(user);
    return this.toView(user);
  }

  async reactivateUser(userId: string): Promise<AuthUserView> {
    const user = await this.requireUser(userId);
    user.reactivate();
    await this.users.save(user);
    return this.toView(user);
  }

  private async requireUser(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new DomainError('NOT_FOUND', 'User not found', 'NOT_FOUND');
    }
    return user;
  }

  private toView(user: User): AuthUserView {
    return { id: user.id, email: user.email, roles: user.roles, status: user.status };
  }
}
