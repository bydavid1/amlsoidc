import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../core/prisma/prisma.service';
import { User } from '../../../domain/entities/user.entity';
import { UserRepository } from '../../../domain/repositories/user.repository';
import { UserMapper } from './user.mapper';

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.client.user.findFirst({ where: { id, deletedAt: null } });
    return row ? UserMapper.toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    // findFirst (no findUnique): la unicidad del email es un índice parcial
    // entre usuarios no borrados (soft delete)
    const row = await this.prisma.client.user.findFirst({ where: { email, deletedAt: null } });
    return row ? UserMapper.toDomain(row) : null;
  }

  async save(user: User): Promise<void> {
    const data = UserMapper.toPersistence(user);
    await this.prisma.client.user.upsert({
      where: { id: data.id },
      create: data,
      update: {
        email: data.email,
        passwordHash: data.passwordHash,
        status: data.status,
        roles: { set: data.roles },
      },
    });
  }
}
