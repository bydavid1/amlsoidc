import { ApiProperty } from '@nestjs/swagger';

export class UserMeResponseDto {
  @ApiProperty({ example: '4f0c2a76-...' })
  id: string;

  @ApiProperty({ example: 'maria@example.com' })
  email: string;

  @ApiProperty({ example: ['BUYER'], enum: ['BUYER', 'TRAVELER', 'ADMIN'], isArray: true })
  roles: string[];

  @ApiProperty({ example: 'ACTIVE', enum: ['ACTIVE', 'SUSPENDED'] })
  status: string;

  @ApiProperty({ nullable: true, example: 'Carlos' })
  firstName: string | null;

  @ApiProperty({ nullable: true, example: '+503 7777 8888' })
  phone: string | null;

  @ApiProperty({ description: 'Nombre + teléfono registrados (requerido para operar)' })
  hasCompleteProfile: boolean;
}
