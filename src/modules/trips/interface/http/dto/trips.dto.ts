import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, IsUUID, Max, Min, MinDate } from 'class-validator';
import { CursorPaginationDto } from '../../../../../shared/http/cursor-pagination';
import { TripStatus } from '../../../domain/entities/trip.entity';

export class CreateTripDto {
  @ApiProperty({ description: 'País de origen (id del catálogo)' })
  @IsUUID()
  originCountryId: string;

  @ApiProperty({ description: 'País de destino (id del catálogo)' })
  @IsUUID()
  destinationCountryId: string;

  @ApiPropertyOptional({ description: 'Ciudad de destino (id del catálogo)' })
  @IsOptional()
  @IsUUID()
  destinationCityId?: string;

  @ApiProperty({ example: '2026-08-15T00:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  @MinDate(() => new Date(), { message: 'arrivalDate must be in the future' })
  arrivalDate: Date;

  @ApiProperty({ example: 3, minimum: 1, maximum: 50, description: 'Pedidos que puede llevar' })
  @IsInt()
  @Min(1)
  @Max(50)
  capacity: number;
}

const TRIP_STATUSES: TripStatus[] = ['DRAFT', 'OPEN', 'IN_PROGRESS', 'CLOSED', 'CANCELLED'];

export class ListTripsQueryDto extends CursorPaginationDto {
  @ApiPropertyOptional({ enum: TRIP_STATUSES })
  @IsOptional()
  @IsEnum(TRIP_STATUSES)
  status?: TripStatus;
}

export class TripResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  originCountryId: string;

  @ApiProperty()
  destinationCountryId: string;

  @ApiProperty({ nullable: true })
  destinationCityId: string | null;

  @ApiProperty({ example: '2026-08-15T00:00:00.000Z' })
  arrivalDate: Date;

  @ApiProperty({ example: 3 })
  totalCapacity: number;

  @ApiProperty({ example: 2 })
  remainingCapacity: number;

  @ApiProperty({ enum: TRIP_STATUSES, example: 'OPEN' })
  status: TripStatus;
}
