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
