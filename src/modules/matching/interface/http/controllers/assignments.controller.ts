import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../../../../../shared/auth/authenticated-user';
import { CurrentUser, Roles } from '../../../../../shared/auth/decorators';
import { CursorPaginationDto } from '../../../../../shared/http/cursor-pagination';
import { AssignmentResponseService } from '../../../application/use-cases/assignment-response.use-cases';
import { AssignmentListItemDto } from '../dto/assignments.dto';

/**
 * Encargos ya reclamados por el Traveler: listado + avance físico del
 * paquete. El claim de nuevos encargos vive en /trips/:id/claim/:orderId.
 */
@ApiTags('Assignments')
@ApiBearerAuth()
@Controller('assignments')
@Roles('TRAVELER')
export class AssignmentsController {
  constructor(private readonly service: AssignmentResponseService) {}

  @Get()
  @ApiOperation({ summary: 'Mis encargos (más recientes primero)' })
  @ApiOkResponse({ type: AssignmentListItemDto, isArray: true })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CursorPaginationDto,
  ): Promise<unknown> {
    return this.service.listMine(user.id, query.limit);
  }

  @Post(':id/mark-received')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'El paquete llegó a manos del Traveler (sub-flujo → RECEIVED)' })
  async markReceived(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ ok: true }> {
    await this.service.markReceived(user.id, id);
    return { ok: true };
  }

  @Post(':id/mark-in-transit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'El Traveler viaja con el paquete (Order → IN_TRANSIT)' })
  async markInTransit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ ok: true }> {
    await this.service.markInTransit(user.id, id);
    return { ok: true };
  }

  @Post(':id/mark-arrived')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'El Traveler llegó al destino (Order → READY_FOR_DELIVERY)' })
  async markArrived(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ ok: true }> {
    await this.service.markArrived(user.id, id);
    return { ok: true };
  }
}
