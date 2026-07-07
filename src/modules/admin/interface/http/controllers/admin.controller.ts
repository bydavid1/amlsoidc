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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { AuthenticatedUser } from '../../../../../shared/auth/authenticated-user';
import { CurrentUser, Roles } from '../../../../../shared/auth/decorators';
import { CursorPaginationDto } from '../../../../../shared/http/cursor-pagination';
import { IdentityAccessService } from '../../../../identity/application/identity-access.service';
import {
  DisputeOrderOutcome,
  DisputeResolution,
  ListDisputesUseCase,
  ResolveDisputeUseCase,
} from '../../../../incidents/application/use-cases/incidents.use-cases';
import { DisputeStatus } from '../../../../incidents/domain/repositories/dispute.repository';
import { AdminOrderRow, AdminQueryService } from '../../../application/admin-query.service';

class AdminListOrdersQueryDto extends CursorPaginationDto {
  @ApiPropertyOptional({ description: 'Filtrar por estado del backbone' })
  @IsOptional()
  status?: string;
}

class AdminListDisputesQueryDto extends CursorPaginationDto {
  @ApiPropertyOptional({ enum: ['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED'] })
  @IsOptional()
  @IsEnum(['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED'])
  status?: DisputeStatus;
}

class ResolveDisputeDto {
  @ApiProperty({ enum: ['RESOLVED', 'REJECTED'] })
  @IsEnum(['RESOLVED', 'REJECTED'])
  resolution: DisputeResolution;

  @ApiProperty({
    enum: ['CANCEL_ORDER', 'RESUME_ORDER'],
    description: 'CANCEL_ORDER: pedido cancelado. RESUME_ORDER: retoma el estado previo a la disputa.',
  })
  @IsEnum(['CANCEL_ORDER', 'RESUME_ORDER'])
  orderOutcome: DisputeOrderOutcome;
}

/**
 * Composición con permisos elevados: reusa casos de uso de otros módulos,
 * CERO lógica de negocio propia (docs/design/02-arquitectura.md).
 */
@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
@Roles('ADMIN')
export class AdminController {
  constructor(
    private readonly queries: AdminQueryService,
    private readonly identityAccess: IdentityAccessService,
    private readonly resolveDispute: ResolveDisputeUseCase,
    private readonly listDisputes: ListDisputesUseCase,
  ) {}

  @Get('orders')
  @ApiOperation({ summary: 'Todos los pedidos (panel de operación)' })
  orders(@Query() query: AdminListOrdersQueryDto): Promise<AdminOrderRow[]> {
    return this.queries.listOrders(query.status, query.limit);
  }

  @Get('disputes')
  @ApiOperation({ summary: 'Disputas por estado' })
  disputes(@Query() query: AdminListDisputesQueryDto): Promise<unknown> {
    return this.listDisputes.execute(query.status, query.limit);
  }

  @Post('disputes/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolver disputa y decidir el destino del pedido' })
  resolve(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) disputeId: string,
    @Body() dto: ResolveDisputeDto,
  ): Promise<unknown> {
    return this.resolveDispute.execute(admin.id, disputeId, dto.resolution, dto.orderOutcome);
  }

  @Post('users/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspender usuario (bloqueo inmediato)' })
  suspend(@Param('id', ParseUUIDPipe) userId: string): Promise<unknown> {
    return this.identityAccess.suspendUser(userId);
  }

  @Post('users/:id/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivar usuario suspendido' })
  reactivate(@Param('id', ParseUUIDPipe) userId: string): Promise<unknown> {
    return this.identityAccess.reactivateUser(userId);
  }
}
