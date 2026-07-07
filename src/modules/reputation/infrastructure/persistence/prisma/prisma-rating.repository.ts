import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../core/prisma/prisma.service';
import {
  RatingRecord,
  RatingRepository,
  ReputationAggregate,
} from '../../../domain/repositories/rating.repository';

@Injectable()
export class PrismaRatingRepository implements RatingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(rating: RatingRecord): Promise<void> {
    await this.prisma.client.rating.create({ data: rating });
  }

  async existsByOrderAndRater(orderId: string, raterUserId: string): Promise<boolean> {
    const row = await this.prisma.client.rating.findFirst({
      where: { orderId, raterUserId, deletedAt: null },
      select: { id: true },
    });
    return row !== null;
  }

  async countForOrder(orderId: string): Promise<number> {
    return this.prisma.client.rating.count({ where: { orderId, deletedAt: null } });
  }

  async aggregateForRatee(rateeUserId: string): Promise<ReputationAggregate> {
    const result = await this.prisma.client.rating.aggregate({
      where: { rateeUserId, deletedAt: null },
      _avg: { score: true },
      _count: { _all: true },
    });
    return {
      average: Math.round((result._avg.score ?? 0) * 100) / 100,
      count: result._count._all,
    };
  }
}
