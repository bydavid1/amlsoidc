import { AggregateRoot } from '../../../../shared/domain/aggregate-root';
import { DomainError } from '../../../../shared/domain/domain-error';
import { UserRegisteredEvent } from '../events/user-registered.event';

export type UserRole = 'BUYER' | 'TRAVELER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'SUSPENDED';

export interface UserProps {
  id: string;
  email: string;
  passwordHash: string;
  status: UserStatus;
  roles: UserRole[];
}

/**
 * Agregado User: identidad, credenciales y roles. Un mismo User puede ser
 * BUYER y TRAVELER a la vez; los perfiles viven en sus contextos (orders/trips).
 */
export class User extends AggregateRoot {
  private constructor(private readonly props: UserProps) {
    super();
  }

  static register(input: { id: string; email: string; passwordHash: string; now: Date }): User {
    const user = new User({
      id: input.id,
      email: input.email,
      passwordHash: input.passwordHash,
      status: 'ACTIVE',
      roles: [],
    });
    user.record(new UserRegisteredEvent(input.now, { userId: input.id, email: input.email }));
    return user;
  }

  /** Rehidratación desde persistencia (solo mappers de infraestructura). */
  static restore(props: UserProps): User {
    return new User(props);
  }

  addRole(role: UserRole): void {
    if (this.props.status === 'SUSPENDED') {
      throw new DomainError('USER_SUSPENDED', 'A suspended user cannot gain roles', 'FORBIDDEN');
    }
    if (!this.props.roles.includes(role)) {
      this.props.roles.push(role);
    }
  }

  suspend(): void {
    this.props.status = 'SUSPENDED';
  }

  reactivate(): void {
    this.props.status = 'ACTIVE';
  }

  get id(): string {
    return this.props.id;
  }
  get email(): string {
    return this.props.email;
  }
  get passwordHash(): string {
    return this.props.passwordHash;
  }
  get status(): UserStatus {
    return this.props.status;
  }
  get roles(): UserRole[] {
    return [...this.props.roles];
  }

  hasRole(role: UserRole): boolean {
    return this.props.roles.includes(role);
  }
}
