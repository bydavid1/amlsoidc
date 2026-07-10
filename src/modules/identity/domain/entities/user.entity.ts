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
  firstName: string | null;
  phone: string | null;
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
      firstName: null,
      phone: null,
    });
    user.record(new UserRegisteredEvent(input.now, { userId: input.id, email: input.email }));
    return user;
  }

  /** Rehidratación desde persistencia (solo mappers de infraestructura). */
  static restore(props: UserProps): User {
    return new User(props);
  }

  /** Perfil mínimo del modelo hub: Bringo necesita nombre y teléfono de ambos actores. */
  updateProfile(input: { firstName: string; phone: string }): void {
    const firstName = input.firstName.trim();
    const phone = input.phone.trim();
    if (firstName.length < 2) {
      throw new DomainError('PROFILE_NAME_INVALID', 'First name is too short', 'UNPROCESSABLE');
    }
    if (!/^\+?[0-9\s-]{8,20}$/.test(phone)) {
      throw new DomainError('PROFILE_PHONE_INVALID', 'Phone number is not valid', 'UNPROCESSABLE');
    }
    this.props.firstName = firstName;
    this.props.phone = phone;
  }

  get hasCompleteProfile(): boolean {
    return this.props.firstName !== null && this.props.phone !== null;
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
  get firstName(): string | null {
    return this.props.firstName;
  }
  get phone(): string | null {
    return this.props.phone;
  }

  hasRole(role: UserRole): boolean {
    return this.props.roles.includes(role);
  }
}
