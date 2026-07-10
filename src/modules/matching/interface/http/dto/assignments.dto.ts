import { ApiProperty } from '@nestjs/swagger';

export class AssignmentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  orderId: string;

  @ApiProperty()
  tripId: string;

  @ApiProperty({ enum: ['ACCEPTED', 'CANCELLED'], example: 'ACCEPTED' })
  status: string;

  @ApiProperty()
  offeredAt: Date;

  @ApiProperty({ nullable: true, description: 'Sin uso en el modelo claim (histórico)' })
  expiresAt: Date | null;

  @ApiProperty({ nullable: true })
  respondedAt: Date | null;
}

/** Fila del listado del Traveler: incluye el contexto del pedido que necesita para actuar. */
export class AssignmentListItemDto extends AssignmentResponseDto {
  @ApiProperty({ example: 'iPhone 15 Pro' })
  productName: string;

  @ApiProperty({ enum: ['SMALL', 'MEDIUM', 'LARGE'], example: 'MEDIUM' })
  sizeCategory: string;

  @ApiProperty({ example: 67.95, description: 'Ganancia del viajero por este encargo' })
  travelerRewardAmount: number;

  @ApiProperty()
  destinationCityId: string;

  @ApiProperty({ example: 'SOURCING', description: 'Backbone del pedido' })
  orderStatus: string;

  @ApiProperty({ nullable: true, example: 'PURCHASED', description: 'Sub-flujo del Fulfillment' })
  fulfillmentStatus: string | null;

  @ApiProperty({ description: 'El buyer ya pagó el servicio a Bringo' })
  servicePaid: boolean;
}
