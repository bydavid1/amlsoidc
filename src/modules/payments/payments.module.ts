import { forwardRef, Module } from '@nestjs/common';
import { PAYMENT_STATUS_PORT } from '../orders/domain/ports/payment-status.port';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsStatusAdapter } from './application/payment-status.adapter';
import { PaymentsService } from './application/payments.service';
import { PAYMENT_PROVIDER } from './domain/ports/payment-provider.port';
import { SERVICE_PAYMENT_REPOSITORY } from './domain/repositories/service-payment.repository';
import { PrismaServicePaymentRepository } from './infrastructure/persistence/prisma/prisma-service-payment.repository';
import { SandboxPaymentProvider } from './infrastructure/providers/sandbox-payment.provider';
import {
  AdminPayoutsController,
  PaymentsController,
} from './interface/http/controllers/payments.controller';

/**
 * Pagos del servicio (docs/design/10-pagos.md). Ciclo con orders vía
 * forwardRef por el gate PAYMENT_STATUS_PORT (mismo patrón que matching).
 * Proveedor por config: sandbox hoy, pasarela real (Wompi/n1co) después.
 */
@Module({
  imports: [forwardRef(() => OrdersModule)],
  controllers: [PaymentsController, AdminPayoutsController],
  providers: [
    { provide: SERVICE_PAYMENT_REPOSITORY, useClass: PrismaServicePaymentRepository },
    { provide: PAYMENT_PROVIDER, useClass: SandboxPaymentProvider },
    PaymentsService,
    { provide: PAYMENT_STATUS_PORT, useClass: PaymentsStatusAdapter },
  ],
  exports: [PAYMENT_STATUS_PORT],
})
export class PaymentsModule {}
