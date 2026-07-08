import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, Min } from 'class-validator';
import { Public } from '../../../../../shared/auth/decorators';
import {
  calculateTravelerReward,
  PRICING_CONFIG,
  PricingConfig,
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

class PricingQuoteResponseDto {
  @ApiProperty({ example: 67.95 })
  total: number;

  @ApiProperty({
    example: { baseFee: 5, valueComponent: 54.95, sizeComponent: 8 },
    description: 'Desglose transparente del cálculo',
  })
  breakdown: { baseFee: number; valueComponent: number; sizeComponent: number };
}

/**
 * Cotización pública de la ganancia del viajero: el formulario del Buyer la
 * previsualiza en vivo. Misma fórmula que fija el reward al crear el pedido.
 */
@ApiTags('Orders')
@Controller('pricing')
export class PricingController {
  constructor(@Inject(PRICING_CONFIG) private readonly pricing: PricingConfig) {}

  @Get('quote')
  @Public()
  @ApiOperation({ summary: 'Cotizar la ganancia del viajero para un precio + tamaño' })
  @ApiOkResponse({ type: PricingQuoteResponseDto })
  quote(@Query() query: PricingQuoteQueryDto): PricingQuoteResponseDto {
    return calculateTravelerReward(query.price, query.size, this.pricing);
  }
}
