import { ApiProperty } from '@nestjs/swagger';

export class AssignmentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  orderId: string;

  @ApiProperty()
  tripId: string;

  @ApiProperty({ enum: ['OFFERED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'] })
  status: string;

  @ApiProperty()
  offeredAt: Date;

  @ApiProperty({ description: 'Vencimiento de la ventana de aceptación' })
  expiresAt: Date;

  @ApiProperty({ nullable: true })
  respondedAt: Date | null;
}

/** Fila del listado del Traveler: incluye el contexto del pedido que necesita para actuar. */
export class AssignmentListItemDto extends AssignmentResponseDto {
  @ApiProperty({ example: 'iPhone 15 Pro' })
  productName: string;

  @ApiProperty()
  destinationCityId: string;

  @ApiProperty({ example: 'SOURCING', description: 'Backbone del pedido' })
  orderStatus: string;

  @ApiProperty({ nullable: true, example: 'PURCHASED', description: 'Sub-flujo del Fulfillment' })
  fulfillmentStatus: string | null;
}
