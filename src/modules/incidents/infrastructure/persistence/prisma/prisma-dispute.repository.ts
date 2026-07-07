import { Injectable } from '@nestjs/common';
import { Dispute as PrismaDispute } from '@prisma/client';
import { PrismaService } from '../../../../../core/prisma/prisma.service';
import {
  DisputeRecord,
  DisputeRepository,
  DisputeStatus,
} from '../../../domain/repositories/dispute.repository';

function toRecord(row: PrismaDispute): DisputeRecord {
  return {
    id: row.id,
    orderId: row.orderId,
    status: row.status as DisputeStatus,
    reason: row.reason,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaDisputeRepository implements DisputeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(dispute: { id: string; orderId: string; reason: string }): Promise<DisputeRecord> {
    const row = await this.prisma.client.dispute.create({ data: dispute });
    return toRecord(row);
  }

  async findById(id: string): Promise<DisputeRecord | null> {
    const row = await this.prisma.client.dispute.findFirst({ where: { id, deletedAt: null } });
    return row ? toRecord(row) : null;
  }

  async findByOrderId(orderId: string): Promise<DisputeRecord | null> {
    const row = await this.prisma.client.dispute.findFirst({
      where: { orderId, deletedAt: null },
    });
    return row ? toRecord(row) : null;
  }

  async updateStatus(id: string, status: DisputeStatus): Promise<void> {
    await this.prisma.client.dispute.update({ where: { id }, data: { status } });
  }

  async list(status: DisputeStatus | undefined, limit: number): Promise<DisputeRecord[]> {
    const rows = await this.prisma.client.dispute.findMany({
      where: { deletedAt: null, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(toRecord);
  }
}
