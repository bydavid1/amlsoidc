import { DomainError } from '../../../../shared/domain/domain-error';
import { User } from '../../domain/entities/user.entity';
import { UserRegisteredEvent } from '../../domain/events/user-registered.event';

describe('User (dominio puro, sin NestJS ni Prisma)', () => {
  const now = new Date('2026-07-06T12:00:00Z');

  const register = () =>
    User.register({ id: 'user-1', email: 'maria@example.com', passwordHash: 'hash', now });

  it('se registra ACTIVE, sin roles, y emite UserRegisteredEvent', () => {
    const user = register();

    expect(user.status).toBe('ACTIVE');
    expect(user.roles).toEqual([]);

    const events = user.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe(UserRegisteredEvent.EVENT_NAME);
    expect(events[0].payload).toEqual({ userId: 'user-1', email: 'maria@example.com' });
    // los eventos se drenan una sola vez
    expect(user.pullDomainEvents()).toHaveLength(0);
  });

  it('addRole es idempotente y soporta multi-rol (Buyer y Traveler a la vez)', () => {
    const user = register();
    user.addRole('BUYER');
    user.addRole('BUYER');
    user.addRole('TRAVELER');

    expect(user.roles).toEqual(['BUYER', 'TRAVELER']);
    expect(user.hasRole('BUYER')).toBe(true);
    expect(user.hasRole('ADMIN')).toBe(false);
  });

  it('un usuario suspendido no puede ganar roles (invariante)', () => {
    const user = register();
    user.suspend();

    expect(() => user.addRole('TRAVELER')).toThrow(DomainError);
    try {
      user.addRole('TRAVELER');
    } catch (e) {
      expect((e as DomainError).code).toBe('USER_SUSPENDED');
      expect((e as DomainError).kind).toBe('FORBIDDEN');
    }
  });

  it('roles devuelve una copia defensiva', () => {
    const user = register();
    user.addRole('BUYER');
    user.roles.push('ADMIN');
    expect(user.roles).toEqual(['BUYER']);
  });
});
