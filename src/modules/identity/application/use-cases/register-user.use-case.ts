import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../../../shared/domain/domain-error';
import { Clock, CLOCK } from '../../../../shared/domain/ports/clock';
import { EVENT_BUS, EventBus } from '../../../../shared/domain/ports/event-bus';
import { ID_GENERATOR, IdGenerator } from '../../../../shared/domain/ports/id-generator';
import { User } from '../../domain/entities/user.entity';
import { USER_REPOSITORY, UserRepository } from '../../domain/repositories/user.repository';
import { PASSWORD_HASHER, PasswordHasher } from '../../domain/services/password-hasher';
import { AuthUserView } from '../views/auth-user.view';

export interface RegisterUserCommand {
  email: string;
  password: string;
}

@Injectable()
export class RegisterUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: RegisterUserCommand): Promise<AuthUserView> {
    const email = command.email.trim().toLowerCase();

    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new DomainError('EMAIL_ALREADY_REGISTERED', 'Email is already registered', 'CONFLICT');
    }

    const passwordHash = await this.hasher.hash(command.password);
    const user = User.register({
      id: this.ids.next(),
      email,
      passwordHash,
      now: this.clock.now(),
    });

    await this.users.save(user);
    await this.eventBus.publishAll(user.pullDomainEvents());

    return { id: user.id, email: user.email, roles: user.roles, status: user.status };
  }
}
