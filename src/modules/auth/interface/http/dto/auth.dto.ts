import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { UserMeResponseDto } from '../../../../identity/interface/http/dto/user-me-response.dto';

export class RegisterDto {
  @ApiProperty({ example: 'maria@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'S3cure-password', minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}

export class LoginDto {
  @ApiProperty({ example: 'maria@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'S3cure-password' })
  @IsString()
  @MinLength(1)
  password: string;
}

export class RefreshDto {
  @ApiProperty({ description: 'Refresh token vigente (se rota en cada uso)' })
  @IsString()
  @MinLength(20)
  refreshToken: string;
}

export class AuthResponseDto {
  @ApiProperty({ type: UserMeResponseDto })
  user: UserMeResponseDto;

  @ApiProperty({ description: 'JWT de acceso (vida corta, 15 min)' })
  accessToken: string;

  @ApiProperty({ description: 'Refresh token opaco (7 días, rotado en cada uso)' })
  refreshToken: string;
}
