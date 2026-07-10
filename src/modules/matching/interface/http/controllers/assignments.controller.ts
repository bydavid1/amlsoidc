import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { AuthenticatedUser } from '../../../../../shared/auth/authenticated-user';
import { CurrentUser, Roles } from '../../../../../shared/auth/decorators';
import { CursorPaginationDto } from '../../../../../shared/http/cursor-pagination';
import { AssignmentResponseService } from '../../../application/use-cases/assignment-response.use-cases';
import { AssignmentListItemDto } from '../dto/assignments.dto';

export class SetReceivingAddressDto {
  @ApiProperty({
    example: '2345 NW 107th Ave, Doral, FL 33172',
    description: 'El buyer la verá SIN datos personales del traveler',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(300)
  addressLine: string;
}

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

  @Post(':id/set-receiving-address')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Registrar la dirección donde el Traveler recibirá el producto (modelo hub)',
  })
  async setReceivingAddress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetReceivingAddressDto,
  ): Promise<{ ok: true }> {
    await this.service.setReceivingAddress(user.id, id, dto.addressLine);
    return { ok: true };
  }
}
