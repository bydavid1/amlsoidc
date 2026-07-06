import { Injectable } from '@nestjs/common';
import { Assignment as PrismaAssignment, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../../core/prisma/prisma.service';
import { Assignment, AssignmentStatus } from '../../../domain/entities/assignment.entity';
import {
  AssignmentListRow,
  AssignmentRepository,
} from '../../../domain/repositories/assignment.repository';

const ACTIVE_STATUSES: AssignmentStatus[] = ['OFFERED', 'ACCEPTED'];

function toDomain(row: PrismaAssignment): Assignment {
  return Assignment.restore({
    id: row.id,
    orderId: row.orderId,
    tripId: row.tripId,
    travelerProfileId: row.travelerProfileId,
    status: row.status as AssignmentStatus,
    scoreBreakdown: (row.scoreBreakdown as Record<string, number> | null) ?? null,
    offeredAt: row.offeredAt,
    respondedAt: row.respondedAt,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  });
}

@Injectable()
export class PrismaAssignmentRepository implements AssignmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Assignment | null> {
    const row = await this.prisma.client.assignment.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async save(assignment: Assignment): Promise<void> {
    const data = {
      orderId: assignment.orderId,
      tripId: assignment.tripId,
      travelerProfileId: assignment.travelerProfileId,
      status: assignment.status,
      scoreBreakdown: assignment.scoreBreakdown ?? Prisma.JsonNull,
      offeredAt: assignment.offeredAt,
      respondedAt: assignment.respondedAt,
      expiresAt: assignment.expiresAt,
    };
    await this.prisma.client.assignment.upsert({
      where: { id: assignment.id },
      create: { id: assignment.id, ...data },
      update: data,
    });
  }

  async findActiveByOrder(orderId: string): Promise<Assignment | null> {
    const row = await this.prisma.client.assignment.findFirst({
      where: { orderId, status: { in: ACTIVE_STATUSES } },
    });
    return row ? toDomain(row) : null;
  }

  async findActiveByTrip(tripId: string): Promise<Assignment[]> {
    const rows = await this.prisma.client.assignment.findMany({
      where: { tripId, status: { in: ACTIVE_STATUSES } },
    });
    return rows.map(toDomain);
  }

  async countForOrder(orderId: string): Promise<number> {
    return this.prisma.client.assignment.count({ where: { orderId } });
  }

  async travelerProfileIdsForOrder(orderId: string): Promise<string[]> {
    const rows = await this.prisma.client.assignment.findMany({
      where: { orderId },
      select: { travelerProfileId: true },
      distinct: ['travelerProfileId'],
    });
    return rows.map((r) => r.travelerProfileId);
  }

  async countActiveByTraveler(travelerProfileIds: string[]): Promise<Map<string, number>> {
    if (travelerProfileIds.length === 0) {
      return new Map();
    }
    const groups = await this.prisma.client.assignment.groupBy({
      by: ['travelerProfileId'],
      where: { travelerProfileId: { in: travelerProfileIds }, status: { in: ACTIVE_STATUSES } },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.travelerProfileId, g._count._all]));
  }

  async listByTraveler(travelerProfileId: string, limit: number): Promise<AssignmentListRow[]> {
    const rows = await this.prisma.client.assignment.findMany({
      where: { travelerProfileId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      tripId: r.tripId,
      status: r.status,
      offeredAt: r.offeredAt,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
    }));
  }

  async findExpiredOffers(now: Date, limit: number): Promise<Assignment[]> {
    const rows = await this.prisma.client.assignment.findMany({
      where: { status: 'OFFERED', expiresAt: { lt: now } },
      take: limit,
    });
    return rows.map(toDomain);
  }
}
