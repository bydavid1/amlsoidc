import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';

export interface AdminOrderRow {
  id: string;
  status: string;
  fulfillmentStatus: string | null;
  productName: string;
  buyerEmail: string;
  originCountryId: string;
  destinationCountryId: string;
  createdAt: Date;
  // desglose COMPLETO del dinero — solo visible para admin
  // (docs/design/09: el Buyer ve solo el total; el Traveler solo su pago)
  sizeCategory: string;
  estimatedPriceAmount: number;
  travelerRewardAmount: number;
  platformFeeAmount: number;
  buyerTotalAmount: number;
}

/**
 * Consultas de operación para el panel Admin. Solo LECTURA compuesta;
 * el módulo admin no contiene lógica de negocio propia
 * (docs/design/02-arquitectura.md).
 */
export interface AdminUserRow {
  id: string;
  email: string;
  firstName: string | null;
  phone: string | null;
  roles: string[];
  status: string;
  createdAt: Date;
}

@Injectable()
export class AdminQueryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Búsqueda de usuarios para operación/soporte (admin ve contacto). */
  async listUsers(query: string | undefined, limit: number): Promise<AdminUserRow[]> {
    const rows = await this.prisma.client.user.findMany({
      where: {
        deletedAt: null,
        ...(query
          ? {
              OR: [
                { email: { contains: query, mode: 'insensitive' } },
                { firstName: { contains: query, mode: 'insensitive' } },
                { phone: { contains: query } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        email: true,
        firstName: true,
        phone: true,
        roles: true,
        status: true,
        createdAt: true,
      },
    });
    return rows;
  }

  async listOrders(status: string | undefined, limit: number): Promise<AdminOrderRow[]> {
    const rows = await this.prisma.client.order.findMany({
      where: {
        deletedAt: null,
        ...(status ? { status: status as never } : {}),
      },
      include: {
        fulfillment: { select: { status: true } },
        buyerProfile: { select: { user: { select: { email: true } } } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return rows.map((r) => {
      const price = Number(r.estimatedPriceAmount);
      const reward = Number(r.travelerRewardAmount);
      const fee = Number(r.platformFeeAmount);
      return {
        id: r.id,
        status: r.status,
        fulfillmentStatus: r.fulfillment?.status ?? null,
        productName: r.productName,
        buyerEmail: r.buyerProfile.user.email,
        originCountryId: r.originCountryId,
        destinationCountryId: r.destinationCountryId,
        createdAt: r.createdAt,
        sizeCategory: r.sizeCategory,
        estimatedPriceAmount: price,
        travelerRewardAmount: reward,
        platformFeeAmount: fee,
        buyerTotalAmount: Math.round((price + reward + fee) * 100) / 100,
      };
    });
  }
}
