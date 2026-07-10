import { Injectable } from '@nestjs/common';
import { Assignment as PrismaAssignment, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../../core/prisma/prisma.service';
import { DomainError } from '../../../../../shared/domain/domain-error';
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
    try {
      await this.prisma.client.assignment.upsert({
        where: { id: assignment.id },
        create: { id: assignment.id, ...data },
        update: data,
      });
    } catch (error) {
      // el índice único parcial (un assignment activo por Order) resuelve la
      // carrera de dos claims: el segundo pierde con un error de negocio claro
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new DomainError(
          'ORDER_ALREADY_TAKEN',
          'Another traveler already claimed this order',
          'CONFLICT',
        );
      }
      throw error;
    }
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

  async listByTraveler(travelerProfileId: string, limit: number): Promise<AssignmentListRow[]> {
    const rows = await this.prisma.client.assignment.findMany({
      where: { travelerProfileId },
      include: {
        order: {
          select: {
            productName: true,
            sizeCategory: true,
            travelerRewardAmount: true,
            destinationCityId: true,
            status: true,
            fulfillment: {
              select: {
                status: true,
                buyerShipsDetail: { select: { travelerAddressLine: true } },
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      tripId: r.tripId,
      status: r.status,
      offeredAt: r.offeredAt,
      respondedAt: r.respondedAt,
      createdAt: r.createdAt,
      productName: r.order.productName,
      sizeCategory: r.order.sizeCategory,
      travelerRewardAmount: Number(r.order.travelerRewardAmount),
      destinationCityId: r.order.destinationCityId,
      orderStatus: r.order.status,
      fulfillmentStatus: r.order.fulfillment?.status ?? null,
      receivingAddressLine: r.order.fulfillment?.buyerShipsDetail?.travelerAddressLine ?? null,
    }));
  }
}
