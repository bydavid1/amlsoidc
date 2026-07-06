import { User } from '../entities/user.entity';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

/** Puerto de persistencia con nombres de negocio; la impl Prisma vive en infrastructure. */
export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<void>;
}
