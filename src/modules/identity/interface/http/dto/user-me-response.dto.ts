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
}
