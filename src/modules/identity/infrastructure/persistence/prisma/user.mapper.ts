import { User as PrismaUser } from '@prisma/client';
import { User, UserRole, UserStatus } from '../../../domain/entities/user.entity';

/** Traducción entidad de dominio ↔ modelo de persistencia (el dominio no conoce Prisma). */
export const UserMapper = {
  toDomain(row: PrismaUser): User {
    return User.restore({
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      status: row.status as UserStatus,
      roles: row.roles as UserRole[],
    });
  },

  toPersistence(user: User): {
    id: string;
    email: string;
    passwordHash: string;
    status: UserStatus;
    roles: UserRole[];
  } {
    return {
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      status: user.status,
      roles: user.roles,
    };
  },
};
