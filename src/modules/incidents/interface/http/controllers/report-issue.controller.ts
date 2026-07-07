import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { AuthenticatedUser } from '../../../../../shared/auth/authenticated-user';
import { CurrentUser } from '../../../../../shared/auth/decorators';
import { ReportIssueUseCase } from '../../../application/use-cases/incidents.use-cases';
import { DisputeRecord } from '../../../domain/repositories/dispute.repository';

export class ReportIssueDto {
  @ApiProperty({ example: 'El producto llegó dañado' })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  reason: string;
}

/** Ruta bajo /orders/:id por diseño de API; el módulo dueño es incidents. */
@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders/:orderId/report-issue')
export class ReportIssueController {
  constructor(private readonly reportIssue: ReportIssueUseCase) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Abrir disputa (Buyer o Traveler asignado; Order → DISPUTED)' })
  execute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: ReportIssueDto,
  ): Promise<DisputeRecord> {
    return this.reportIssue.execute(user.id, orderId, dto.reason);
  }
}
