import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, Min } from 'class-validator';
import { Public } from '../../../../../shared/auth/decorators';
import {
  PRICING_CONFIG,
  PricingConfig,
  quotePricing,
  SIZE_CATEGORIES,
  SizeCategory,
} from '../../../domain/services/pricing-policy';

class PricingQuoteQueryDto {
  @ApiProperty({ example: 1099.99, minimum: 0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @ApiProperty({ enum: SIZE_CATEGORIES, example: 'MEDIUM' })
  @IsEnum(SIZE_CATEGORIES)
  size: SizeCategory;
}

class PublicQuoteResponseDto {
  @ApiProperty({
    example: 1181.53,
    description: 'Total aproximado a pagar (producto + servicio), sin desglose',
  })
  estimatedTotal: number;
}

/**
 * Cotización PÚBLICA para el Buyer: SOLO el total aproximado
 * (docs/design/09 — el split viajero/plataforma es dato interno y nunca
 * se expone en superficies públicas).
 */
@ApiTags('Orders')
@Controller('pricing')
export class PricingController {
  constructor(@Inject(PRICING_CONFIG) private readonly pricing: PricingConfig) {}

  @Get('quote')
  @Public()
  @ApiOperation({ summary: 'Total aproximado a pagar por un pedido (precio + tamaño)' })
  @ApiOkResponse({ type: PublicQuoteResponseDto })
  quote(@Query() query: PricingQuoteQueryDto): PublicQuoteResponseDto {
    const quote = quotePricing(query.price, query.size, this.pricing);
    return { estimatedTotal: quote.estimatedTotal };
  }
}
