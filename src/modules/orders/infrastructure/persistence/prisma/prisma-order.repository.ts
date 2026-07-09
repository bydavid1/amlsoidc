import { Injectable } from '@nestjs/common';
import { Fulfillment as PrismaFulfillment, Order as PrismaOrder } from '@prisma/client';
import { PrismaService } from '../../../../../core/prisma/prisma.service';
import { CursorRef } from '../../../../../shared/http/cursor-pagination';
import { Order, OrderStatus } from '../../../domain/entities/order.entity';
import {
  FulfillmentStatus,
  FulfillmentType,
} from '../../../domain/fulfillment/fulfillment-strategy';
import { SizeCategory } from '../../../domain/services/pricing-policy';
import {
  OrderListRow,
  OrderRepository,
  StatusHistoryRow,
} from '../../../domain/repositories/order.repository';

type OrderWithRelations = PrismaOrder & {
  fulfillment: PrismaFulfillment | null;
  buyerProfile: { userId: string };
};

function toDomain(row: OrderWithRelations): Order {
  return Order.restore({
    id: row.id,
    buyerProfileId: row.buyerProfileId,
    buyerUserId: row.buyerProfile.userId,
    originCountryId: row.originCountryId,
    destinationCountryId: row.destinationCountryId,
    destinationCityId: row.destinationCityId,
    productName: row.productName,
    productUrl: row.productUrl,
    estimatedPriceAmount: Number(row.estimatedPriceAmount),
    estimatedPriceCurrency: row.estimatedPriceCurrency,
    sizeCategory: row.sizeCategory as SizeCategory,
    travelerRewardAmount: Number(row.travelerRewardAmount),
    platformFeeAmount: Number(row.platformFeeAmount),
    neededBy: row.neededBy,
    status: row.status as OrderStatus,
    fulfillment: row.fulfillment
      ? {
          id: row.fulfillment.id,
          type: row.fulfillment.type as FulfillmentType,
          status: row.fulfillment.status as FulfillmentStatus,
        }
      : null,
    createdAt: row.createdAt,
  });
}

@Injectable()
export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Order | null> {
    const row = await this.prisma.client.order.findFirst({
      where: { id, deletedAt: null },
      include: { fulfillment: true, buyerProfile: { select: { userId: true } } },
    });
    return row ? toDomain(row as OrderWithRelations) : null;
  }

  async save(order: Order): Promise<void> {
    const data = {
      buyerProfileId: order.buyerProfileId,
      originCountryId: order.originCountryId,
      destinationCountryId: order.destinationCountryId,
      destinationCityId: order.destinationCityId,
      productName: order.productName,
      productUrl: order.productUrl,
      estimatedPriceAmount: order.estimatedPriceAmount,
      estimatedPriceCurrency: order.estimatedPriceCurrency,
      sizeCategory: order.sizeCategory,
      travelerRewardAmount: order.travelerRewardAmount,
      platformFeeAmount: order.platformFeeAmount,
      neededBy: order.neededBy,
      status: order.status,
    };
    await this.prisma.client.order.upsert({
      where: { id: order.id },
      create: { id: order.id, ...data },
      update: data,
    });

    const fulfillment = order.fulfillment;
    if (fulfillment) {
      await this.prisma.client.fulfillment.upsert({
        where: { orderId: order.id },
        create: {
          id: fulfillment.id,
          orderId: order.id,
          type: fulfillment.type,
          status: fulfillment.status,
        },
        update: { status: fulfillment.status },
      });
    } else {
      // returnToPending eliminó el fulfillment (vuelve a matching limpio)
      await this.prisma.client.fulfillment.deleteMany({ where: { orderId: order.id } });
    }

    // historial en la MISMA transacción que el cambio de estado (riesgo R5)
    const transitions = order.pullStatusTransitions();
    if (transitions.length > 0) {
      await this.prisma.client.orderStatusHistory.createMany({
        data: transitions.map((t) => ({
          orderId: order.id,
          fromState: t.from,
          toState: t.to,
          actor: t.actor,
        })),
      });
    }
  }

  async listByBuyer(
    buyerProfileId: string,
    limit: number,
    cursor: CursorRef | null,
    status?: OrderStatus,
  ): Promise<OrderListRow[]> {
    const rows = await this.prisma.client.order.findMany({
      where: {
        buyerProfileId,
        deletedAt: null,
        ...(status ? { status } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      include: { fulfillment: { select: { status: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return rows.map((r) => ({
      id: r.id,
      productName: r.productName,
      originCountryId: r.originCountryId,
      destinationCountryId: r.destinationCountryId,
      status: r.status as OrderStatus,
      fulfillmentStatus: r.fulfillment?.status ?? null,
      sizeCategory: r.sizeCategory,
      estimatedTotalAmount:
        Math.round(
          (Number(r.estimatedPriceAmount) +
            Number(r.travelerRewardAmount) +
            Number(r.platformFeeAmount)) *
            100,
        ) / 100,
      createdAt: r.createdAt,
    }));
  }

  async getStatusHistory(orderId: string): Promise<StatusHistoryRow[]> {
    const rows = await this.prisma.client.orderStatusHistory.findMany({
      where: { orderId },
      orderBy: { occurredAt: 'asc' },
    });
    return rows.map((r) => ({
      fromState: r.fromState,
      toState: r.toState,
      actor: r.actor,
      occurredAt: r.occurredAt,
    }));
  }
}
