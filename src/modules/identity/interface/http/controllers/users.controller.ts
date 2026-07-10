import { Body, Controller, Get, NotFoundException, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../../../../../shared/auth/decorators';
import { AuthenticatedUser } from '../../../../../shared/auth/authenticated-user';
import { IdentityAccessService } from '../../../application/identity-access.service';
import { UserMeResponseDto } from '../dto/user-me-response.dto';

export class UpdateProfileDto {
  @ApiProperty({ example: 'Carlos' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  firstName: string;

  @ApiProperty({ example: '+503 7777 8888' })
  @IsString()
  @Matches(/^\+?[0-9\s-]{8,20}$/, { message: 'phone must be a valid phone number' })
  phone: string;
}

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly identityAccess: IdentityAccessService) {}

  @Get('me')
  @ApiOperation({ summary: 'Datos del usuario autenticado (identidad + roles + perfil)' })
  @ApiOkResponse({ type: UserMeResponseDto })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<UserMeResponseDto> {
    const view = await this.identityAccess.getAuthUser(user.id);
    if (!view) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' });
    }
    return view;
  }

  @Patch('me')
  @ApiOperation({ summary: 'Completar/actualizar perfil (nombre + teléfono, requerido para operar)' })
  @ApiOkResponse({ type: UserMeResponseDto })
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserMeResponseDto> {
    return this.identityAccess.updateProfile(user.id, dto);
  }
}
