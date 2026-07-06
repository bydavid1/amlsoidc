import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../core/prisma/prisma.service';
import {
  BuyerProfileRepository,
  BuyerProfileView,
} from '../../../domain/repositories/buyer-profile.repository';

@Injectable()
export class PrismaBuyerProfileRepository implements BuyerProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<BuyerProfileView | null> {
    const row = await this.prisma.client.buyerProfile.findFirst({
      where: { userId, deletedAt: null },
      select: { id: true, userId: true },
    });
    return row ?? null;
  }

  async create(profile: { id: string; userId: string }): Promise<BuyerProfileView> {
    const row = await this.prisma.client.buyerProfile.create({
      data: profile,
      select: { id: true, userId: true },
    });
    return row;
  }
}
