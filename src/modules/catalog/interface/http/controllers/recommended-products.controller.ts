import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../../../shared/auth/decorators';
import { CatalogService, RecommendedProductView } from '../../../application/catalog.service';

export class RecommendedProductDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'iPhone 15 Pro 256GB' })
  name: string;

  @ApiProperty()
  productUrl: string;

  @ApiProperty({ nullable: true })
  imageUrl: string | null;

  @ApiProperty({ example: 1099.99 })
  estimatedPriceAmount: number;

  @ApiProperty({ example: 'USD' })
  estimatedPriceCurrency: string;

  @ApiProperty({ enum: ['SMALL', 'MEDIUM', 'LARGE'] })
  sizeCategory: string;

  @ApiProperty()
  originCountryId: string;

  @ApiProperty({ example: 1181.53, description: 'Total aproximado con servicio (sin desglose)' })
  estimatedTotalAmount: number;
}

@ApiTags('Orders')
@Controller('recommended-products')
export class RecommendedProductsController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Productos recomendados por Bringo (curaduría)' })
  @ApiOkResponse({ type: RecommendedProductDto, isArray: true })
  list(): Promise<RecommendedProductView[]> {
    return this.catalog.listActive();
  }
}
