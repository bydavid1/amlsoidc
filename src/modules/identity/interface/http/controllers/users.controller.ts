import { Controller, Get, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../../shared/auth/decorators';
import { AuthenticatedUser } from '../../../../../shared/auth/authenticated-user';
import { IdentityAccessService } from '../../../application/identity-access.service';
import { UserMeResponseDto } from '../dto/user-me-response.dto';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly identityAccess: IdentityAccessService) {}

  @Get('me')
  @ApiOperation({ summary: 'Datos del usuario autenticado (identidad + roles)' })
  @ApiOkResponse({ type: UserMeResponseDto })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<UserMeResponseDto> {
    const view = await this.identityAccess.getAuthUser(user.id);
    if (!view) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' });
    }
    return view;
  }
}
