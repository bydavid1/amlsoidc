import { Injectable } from '@nestjs/common';
import { ServicePayment as PrismaPayment } from '@prisma/client';
import { PrismaService } from '../../../../../core/prisma/prisma.service';
import {
  PaymentStatus,
  PayoutStatus,
  ServicePayment,
} from '../../../domain/entities/service-payment.entity';
import {
  PayoutRow,
  ServicePaymentRepository,
} from '../../../domain/repositories/service-payment.repository';

function toDomain(row: PrismaPayment): ServicePayment {
  return ServicePayment.restore({
    id: row.id,
    orderId: row.orderId,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status as PaymentStatus,
    provider: row.provider,
    providerRef: row.providerRef,
    paidAt: row.paidAt,
    payoutStatus: row.payoutStatus as PayoutStatus,
    payoutAt: row.payoutAt,
    refundedAt: row.refundedAt,
  });
}

@Injectable()
export class PrismaServicePaymentRepository implements ServicePaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<ServicePayment | null> {
    const row = await this.prisma.client.servicePayment.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByOrderId(orderId: string): Promise<ServicePayment | null> {
    const row = await this.prisma.client.servicePayment.findUnique({ where: { orderId } });
    return row ? toDomain(row) : null;
  }

  async findByProviderRef(providerRef: string): Promise<ServicePayment | null> {
    const row = await this.prisma.client.servicePayment.findUnique({ where: { providerRef } });
    return row ? toDomain(row) : null;
  }

  async save(payment: ServicePayment): Promise<void> {
    const data = {
      orderId: payment.orderId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      provider: payment.provider,
      providerRef: payment.providerRef,
      paidAt: payment.paidAt,
      payoutStatus: payment.payoutStatus,
      payoutAt: payment.payoutAt,
      refundedAt: payment.refundedAt,
    };
    await this.prisma.client.servicePayment.upsert({
      where: { id: payment.id },
      create: { id: payment.id, ...data },
      update: data,
    });
  }

  async listRefundsDue(
    limit: number,
  ): Promise<{ paymentId: string; orderId: string; amount: number; currency: string }[]> {
    const rows = await this.prisma.client.servicePayment.findMany({
      where: { status: 'REFUND_DUE' },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    return rows.map((p) => ({
      paymentId: p.id,
      orderId: p.orderId,
      amount: Number(p.amount),
      currency: p.currency,
    }));
  }

  async listPayouts(status: PayoutStatus | undefined, limit: number): Promise<PayoutRow[]> {
    const payments = await this.prisma.client.servicePayment.findMany({
      where: status ? { payoutStatus: status } : { payoutStatus: { not: 'NOT_DUE' } },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    if (payments.length === 0) return [];

    const orderIds = payments.map((p) => p.orderId);
    const [orders, assignments] = await Promise.all([
      this.prisma.client.order.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, productName: true, travelerRewardAmount: true },
      }),
      this.prisma.client.assignment.findMany({
        where: { orderId: { in: orderIds }, status: 'ACCEPTED' },
        select: {
          orderId: true,
          travelerProfileId: true,
        },
      }),
    ]);
    const profileIds = [...new Set(assignments.map((a) => a.travelerProfileId))];
    const profiles = await this.prisma.client.travelerProfile.findMany({
      where: { id: { in: profileIds } },
      select: { id: true, user: { select: { firstName: true, phone: true } } },
    });

    const orderById = new Map(orders.map((o) => [o.id, o]));
    const profileByOrder = new Map(
      assignments.map((a) => [a.orderId, profiles.find((p) => p.id === a.travelerProfileId)]),
    );

    return payments.map((p) => {
      const order = orderById.get(p.orderId);
      const profile = profileByOrder.get(p.orderId);
      return {
        paymentId: p.id,
        orderId: p.orderId,
        productName: order?.productName ?? '(pedido)',
        travelerFirstName: profile?.user.firstName ?? null,
        travelerPhone: profile?.user.phone ?? null,
        rewardAmount: Number(order?.travelerRewardAmount ?? 0),
        payoutStatus: p.payoutStatus as PayoutStatus,
        paidAt: p.paidAt,
        payoutAt: p.payoutAt,
      };
    });
  }
}
