import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../../../../../shared/auth/authenticated-user';
import { CurrentUser, Roles } from '../../../../../shared/auth/decorators';
import { CursorPaginationDto } from '../../../../../shared/http/cursor-pagination';
import { Assignment } from '../../../domain/entities/assignment.entity';
import { AssignmentResponseService } from '../../../application/use-cases/assignment-response.use-cases';
import { AssignmentListItemDto, AssignmentResponseDto } from '../dto/assignments.dto';

function toDto(a: Assignment): AssignmentResponseDto {
  return {
    id: a.id,
    orderId: a.orderId,
    tripId: a.tripId,
    status: a.status,
    offeredAt: a.offeredAt,
    expiresAt: a.expiresAt,
    respondedAt: a.respondedAt,
  };
}

/**
 * El Traveler responde ofertas y reporta el avance físico del paquete.
 * El Buyer nunca ve candidatos: el matching es interno (docs/design/04-api.md §7).
 */
@ApiTags('Assignments')
@ApiBearerAuth()
@Controller('assignments')
@Roles('TRAVELER')
export class AssignmentsController {
  constructor(private readonly service: AssignmentResponseService) {}

  @Get()
  @ApiOperation({ summary: 'Mis ofertas/asignaciones (más recientes primero)' })
  @ApiOkResponse({ type: AssignmentListItemDto, isArray: true })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CursorPaginationDto,
  ): Promise<unknown> {
    return this.service.listMine(user.id, query.limit);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aceptar oferta (Order → ASSIGNED; capacidad firme)' })
  @ApiOkResponse({ type: AssignmentResponseDto })
  async accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AssignmentResponseDto> {
    return toDto(await this.service.accept(user.id, id));
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rechazar oferta (libera capacidad; se ofrece al siguiente)' })
  @ApiOkResponse({ type: AssignmentResponseDto })
  async reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AssignmentResponseDto> {
    return toDto(await this.service.reject(user.id, id));
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
