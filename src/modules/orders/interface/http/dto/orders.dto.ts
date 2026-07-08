import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,

  IsISO4217CurrencyCode,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,

  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CursorPaginationDto } from '../../../../../shared/http/cursor-pagination';
import { Order, OrderStatus } from '../../../domain/entities/order.entity';
import { StatusHistoryRow } from '../../../domain/repositories/order.repository';
import { SizeCategory } from '../../../domain/services/pricing-policy';

export class CreateOrderDto {
  @ApiProperty({ description: 'País donde se comprará (id del catálogo)' })
  @IsUUID()
  originCountryId: string;

  @ApiProperty({ description: 'País de entrega (id del catálogo)' })
  @IsUUID()
  destinationCountryId: string;

  @ApiProperty({ description: 'Ciudad de entrega (id del catálogo)' })
  @IsUUID()
  destinationCityId: string;

  @ApiProperty({ example: 'iPhone 15 Pro' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  productName: string;

  @ApiProperty({ example: 'https://www.apple.com/shop/buy-iphone' })
  @IsUrl({ require_protocol: true })
  @MaxLength(2000)
  productUrl: string;

  @ApiProperty({ example: 1099.99, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedPriceAmount: number;

  @ApiProperty({ example: 'USD' })
  @IsISO4217CurrencyCode()
  estimatedPriceCurrency: string;

  @ApiProperty({
    enum: ['SMALL', 'MEDIUM', 'LARGE'],
    example: 'MEDIUM',
    description: 'Tamaño del artículo: alimenta el pricing y el juicio del viajero',
  })
  @IsEnum(['SMALL', 'MEDIUM', 'LARGE'])
  sizeCategory: SizeCategory;

  @ApiPropertyOptional({ example: '2026-09-01T00:00:00.000Z', description: 'Fecha límite deseada' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  neededBy?: Date;
}

const ORDER_STATUSES: OrderStatus[] = [
  'PENDING_ASSIGNMENT',
  'ASSIGNED',
  'SOURCING',
  'IN_TRANSIT',
  'READY_FOR_DELIVERY',
  'DELIVERED',
  'COMPLETED',
  'DELIVERY_FAILED',
  'DISPUTED',
  'CANCELLED',
  'EXPIRED',
];

export class ListOrdersQueryDto extends CursorPaginationDto {
  @ApiPropertyOptional({ enum: ORDER_STATUSES })
  @IsOptional()
  @IsEnum(ORDER_STATUSES)
  status?: OrderStatus;
}

export class OrderResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ORDER_STATUSES, description: 'Backbone (nivel 1)' })
  status: OrderStatus;

  @ApiPropertyOptional({ description: 'Sub-flujo del Fulfillment (nivel 2)', nullable: true })
  fulfillmentStatus: string | null;

  @ApiPropertyOptional({ nullable: true })
  fulfillmentType: string | null;

  @ApiProperty({
    description: 'Proyección aplanada para clientes: sub-flujo cuando aplica, backbone si no',
  })
  displayStatus: string;

  @ApiProperty()
  productName: string;

  @ApiProperty()
  productUrl: string;

  @ApiProperty({ example: 1099.99 })
  estimatedPriceAmount: number;

  @ApiProperty({ example: 'USD' })
  estimatedPriceCurrency: string;

  @ApiProperty({ enum: ['SMALL', 'MEDIUM', 'LARGE'], example: 'MEDIUM' })
  sizeCategory: string;

  @ApiProperty({ example: 67.95, description: 'Ganancia del viajero (fijada al crear)' })
  travelerRewardAmount: number;

  @ApiProperty()
  originCountryId: string;

  @ApiProperty()
  destinationCountryId: string;

  @ApiProperty()
  destinationCityId: string;

  @ApiPropertyOptional({ nullable: true })
  neededBy: Date | null;

  @ApiProperty()
  createdAt: Date;

  static from(order: Order): OrderResponseDto {
    const f = order.fulfillment;
    const dto = new OrderResponseDto();
    dto.id = order.id;
    dto.status = order.status;
    dto.fulfillmentStatus = f?.status ?? null;
    dto.fulfillmentType = f?.type ?? null;
    // vista aplanada = proyección, nunca una tercera columna (docs/design/03 §7)
    dto.displayStatus = order.status === 'SOURCING' && f ? f.status : order.status;
    dto.productName = order.productName;
    dto.productUrl = order.productUrl;
    dto.estimatedPriceAmount = order.estimatedPriceAmount;
    dto.estimatedPriceCurrency = order.estimatedPriceCurrency;
    dto.sizeCategory = order.sizeCategory;
    dto.travelerRewardAmount = order.travelerRewardAmount;
    dto.originCountryId = order.originCountryId;
    dto.destinationCountryId = order.destinationCountryId;
    dto.destinationCityId = order.destinationCityId;
    dto.neededBy = order.neededBy;
    dto.createdAt = order.createdAt;
    return dto;
  }
}

export class OrderTimelineEntryDto {
  @ApiProperty({ nullable: true })
  fromState: string | null;

  @ApiProperty()
  toState: string;

  @ApiProperty({ nullable: true })
  actor: string | null;

  @ApiProperty()
  occurredAt: Date;

  static from(row: StatusHistoryRow): OrderTimelineEntryDto {
    const dto = new OrderTimelineEntryDto();
    dto.fromState = row.fromState;
    dto.toState = row.toState;
    dto.actor = row.actor;
    dto.occurredAt = row.occurredAt;
    return dto;
  }
}

export class OrderDetailResponseDto extends OrderResponseDto {
  @ApiProperty({ type: OrderTimelineEntryDto, isArray: true })
  timeline: OrderTimelineEntryDto[];
}
