import { Injectable } from '@nestjs/common';
import { TravelerProfile as PrismaTravelerProfile } from '@prisma/client';
import { PrismaService } from '../../../../../core/prisma/prisma.service';
import {
  TravelerProfileRepository,
  TravelerProfileView,
} from '../../../domain/repositories/traveler-profile.repository';

function toView(row: PrismaTravelerProfile): TravelerProfileView {
  return {
    id: row.id,
    userId: row.userId,
    reputationScore: Number(row.reputationScore),
    reputationCount: row.reputationCount,
  };
}

@Injectable()
export class PrismaTravelerProfileRepository implements TravelerProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<TravelerProfileView | null> {
    const row = await this.prisma.client.travelerProfile.findFirst({
      where: { userId, deletedAt: null },
    });
    return row ? toView(row) : null;
  }

  async findById(id: string): Promise<TravelerProfileView | null> {
    const row = await this.prisma.client.travelerProfile.findFirst({
      where: { id, deletedAt: null },
    });
    return row ? toView(row) : null;
  }

  async create(profile: { id: string; userId: string }): Promise<TravelerProfileView> {
    const row = await this.prisma.client.travelerProfile.create({ data: profile });
    return toView(row);
  }
}
