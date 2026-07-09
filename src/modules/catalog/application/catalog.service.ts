import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import {
  PRICING_CONFIG,
  PricingConfig,
  quotePricing,
  SizeCategory,
} from '../../orders/domain/services/pricing-policy';

/**
 * Curaduría de productos recomendados (docs de negocio: inspirar al Buyer
 * para que el sistema no se sienta vacío). El equipo los publica vía admin;
 * el Buyer los ve con su TOTAL aproximado (nunca el split del servicio).
 */
export interface RecommendedProductView {
  id: string;
  name: string;
  productUrl: string;
  imageUrl: string | null;
  estimatedPriceAmount: number;
  estimatedPriceCurrency: string;
  sizeCategory: string;
  originCountryId: string;
  estimatedTotalAmount: number;
}

export interface CreateRecommendedProductInput {
  name: string;
  productUrl: string;
  imageUrl?: string;
  estimatedPriceAmount: number;
  sizeCategory: SizeCategory;
  originCountryId: string;
  sortOrder?: number;
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRICING_CONFIG) private readonly pricing: PricingConfig,
  ) {}

  async listActive(): Promise<RecommendedProductView[]> {
    const rows = await this.prisma.client.recommendedProduct.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      take: 24,
    });
    return rows.map((r) => {
      const price = Number(r.estimatedPriceAmount);
      const quote = quotePricing(price, r.sizeCategory as SizeCategory, this.pricing);
      return {
        id: r.id,
        name: r.name,
        productUrl: r.productUrl,
        imageUrl: r.imageUrl,
        estimatedPriceAmount: price,
        estimatedPriceCurrency: r.estimatedPriceCurrency,
        sizeCategory: r.sizeCategory,
        originCountryId: r.originCountryId,
        // el Buyer ve el total con servicio, calculado con la config VIGENTE
        estimatedTotalAmount: quote.estimatedTotal,
      };
    });
  }

  async create(input: CreateRecommendedProductInput): Promise<{ id: string }> {
    const row = await this.prisma.client.recommendedProduct.create({
      data: {
        name: input.name,
        productUrl: input.productUrl,
        imageUrl: input.imageUrl ?? null,
        estimatedPriceAmount: input.estimatedPriceAmount,
        sizeCategory: input.sizeCategory,
        originCountryId: input.originCountryId,
        sortOrder: input.sortOrder ?? 0,
      },
      select: { id: true },
    });
    return row;
  }

  async deactivate(id: string): Promise<void> {
    const result = await this.prisma.client.recommendedProduct.updateMany({
      where: { id, isActive: true },
      data: { isActive: false },
    });
    if (result.count === 0) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Product not found' });
    }
  }
}
