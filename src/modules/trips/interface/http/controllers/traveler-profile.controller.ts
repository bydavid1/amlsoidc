import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../../../../../shared/auth/authenticated-user';
import { CurrentUser } from '../../../../../shared/auth/decorators';
import { ActivateTravelerProfileUseCase } from '../../../application/use-cases/trips.use-cases';
import { TravelerProfileView } from '../../../domain/repositories/traveler-profile.repository';

/**
 * Ruta bajo /users/me por diseño de API, pero el módulo dueño es trips:
 * el TravelerProfile pertenece a su contexto (docs/design/02-arquitectura.md).
 */
@ApiTags('Users')
@ApiBearerAuth()
@Controller('users/me/traveler-profile')
export class TravelerProfileController {
  constructor(private readonly activate: ActivateTravelerProfileUseCase) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Activar rol Traveler (crea el perfil; idempotente)' })
  execute(@CurrentUser() user: AuthenticatedUser): Promise<TravelerProfileView> {
    return this.activate.execute(user.id);
  }
}
