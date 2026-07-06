import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../../../../../shared/auth/authenticated-user';
import { CurrentUser } from '../../../../../shared/auth/decorators';
import { ActivateBuyerProfileUseCase } from '../../../application/use-cases/orders.use-cases';
import { BuyerProfileView } from '../../../domain/repositories/buyer-profile.repository';

/** Ruta bajo /users/me por diseño de API; el módulo dueño es orders. */
@ApiTags('Users')
@ApiBearerAuth()
@Controller('users/me/buyer-profile')
export class BuyerProfileController {
  constructor(private readonly activate: ActivateBuyerProfileUseCase) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Activar rol Buyer (crea el perfil; idempotente)' })
  execute(@CurrentUser() user: AuthenticatedUser): Promise<BuyerProfileView> {
    return this.activate.execute(user.id);
  }
}
