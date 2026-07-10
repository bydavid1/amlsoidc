import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { AuthenticatedUser } from '../../../../../shared/auth/authenticated-user';
import { CurrentUser, Public, Roles } from '../../../../../shared/auth/decorators';
import { CursorPaginationDto } from '../../../../../shared/http/cursor-pagination';
import { PaymentsService, PaymentView } from '../../../application/payments.service';
import { PayoutRow } from '../../../domain/repositories/service-payment.repository';

export class CheckoutResponseDto {
  @ApiProperty({ description: 'URL del checkout del proveedor (redirigir al buyer)' })
  checkoutUrl: string;

  @ApiProperty({ example: 81.54, description: 'Costo del servicio (sin desglose)' })
  amount: number;

  @ApiProperty({ example: 'USD' })
  currency: string;
}

export class PaymentStatusDto {
  @ApiProperty({ enum: ['PENDING', 'PAID', 'FAILED', 'REFUND_DUE', 'REFUNDED'] })
  status: string;

  @ApiProperty({ example: 81.54 })
  amount: number;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({ nullable: true })
  paidAt: Date | null;
}

/** Pago del servicio por el Buyer (docs/design/10-pagos.md). */
@ApiTags('Payments')
@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('orders/:orderId/payment/checkout')
  @ApiBearerAuth()
  @Roles('BUYER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar el pago del servicio (devuelve URL de checkout)' })
  @ApiOkResponse({ type: CheckoutResponseDto })
  checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<CheckoutResponseDto> {
    return this.payments.createCheckout(user.id, orderId);
  }

  @Get('orders/:orderId/payment')
  @ApiBearerAuth()
  @Roles('BUYER')
  @ApiOperation({ summary: 'Estado del pago del servicio (null si aún no se inicia)' })
  @ApiOkResponse({ type: PaymentStatusDto })
  status(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<PaymentView | null> {
    return this.payments.getPaymentForBuyer(user.id, orderId);
  }

  @Post('payments/webhook/:provider')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook del proveedor de pagos (firma verificada)' })
  async webhook(
    @Param('provider') provider: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
  ): Promise<{ ok: true }> {
    await this.payments.handleWebhook(provider, headers, body);
    return { ok: true };
  }
}

class ListPayoutsQueryDto extends CursorPaginationDto {
  @ApiProperty({ required: false, enum: ['DUE', 'PAID_OUT'] })
  @IsOptional()
  @IsEnum(['DUE', 'PAID_OUT'])
  status?: 'DUE' | 'PAID_OUT';
}

/** Operación de payouts/refunds — solo Bringo (admin ve contacto del viajero). */
@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
@Roles('ADMIN')
export class AdminPayoutsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('payouts')
  @ApiOperation({ summary: 'Cola de pagos al viajero (DUE = listos para pagar)' })
  list(@Query() query: ListPayoutsQueryDto): Promise<PayoutRow[]> {
    return this.payments.listPayouts(query.status, query.limit);
  }

  @Post('payouts/:paymentId/mark-paid')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Payout ejecutado (efectivo/transferencia al viajero)' })
  async markPaid(@Param('paymentId', ParseUUIDPipe) paymentId: string): Promise<{ ok: true }> {
    await this.payments.markPaidOut(paymentId);
    return { ok: true };
  }

  @Post('payments/:paymentId/mark-refunded')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reembolso ejecutado al comprador' })
  async markRefunded(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ): Promise<{ ok: true }> {
    await this.payments.markRefunded(paymentId);
    return { ok: true };
  }
}
