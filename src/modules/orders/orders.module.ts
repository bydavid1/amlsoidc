import { forwardRef, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../core/config/env.validation';
import { GeographyModule } from '../geography/geography.module';
import { IdentityModule } from '../identity/identity.module';
import { MatchingModule } from '../matching/matching.module';
import { OrdersCoordinationService } from './application/orders-coordination.service';
import {
  ActivateBuyerProfileUseCase,
  CancelOrderUseCase,
  ConfirmDeliveryUseCase,
  ConfirmPurchaseUseCase,
  CreateOrderUseCase,
  GetMyOrderUseCase,
  ListMyOrdersUseCase,
} from './application/use-cases/orders.use-cases';
import {
  BuyerShipsToTravelerStrategy,
  FulfillmentStrategyResolver,
} from './domain/fulfillment/fulfillment-strategy';
import { BUYER_PROFILE_REPOSITORY } from './domain/repositories/buyer-profile.repository';
import { ORDER_REPOSITORY } from './domain/repositories/order.repository';
import { PRICING_CONFIG, PricingConfig } from './domain/services/pricing-policy';
import { PrismaBuyerProfileRepository } from './infrastructure/persistence/prisma/prisma-buyer-profile.repository';
import { PrismaOrderRepository } from './infrastructure/persistence/prisma/prisma-order.repository';
import { BuyerProfileController } from './interface/http/controllers/buyer-profile.controller';
import { OrdersController } from './interface/http/controllers/orders.controller';
import { PricingController } from './interface/http/controllers/pricing.controller';

@Module({
  imports: [GeographyModule, IdentityModule, forwardRef(() => MatchingModule)],
  controllers: [OrdersController, BuyerProfileController, PricingController],
  providers: [
    { provide: ORDER_REPOSITORY, useClass: PrismaOrderRepository },
    { provide: BUYER_PROFILE_REPOSITORY, useClass: PrismaBuyerProfileRepository },
    {
      // pricing del viajero: config validada al arranque, nunca hardcode
      provide: PRICING_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>): PricingConfig => ({
        baseFee: config.get('PRICING_BASE_FEE', { infer: true }),
        valueRate: config.get('PRICING_VALUE_RATE', { infer: true }),
        valueCap: config.get('PRICING_VALUE_CAP', { infer: true }),
        sizeFees: {
          SMALL: config.get('PRICING_SIZE_FEE_SMALL', { infer: true }),
          MEDIUM: config.get('PRICING_SIZE_FEE_MEDIUM', { infer: true }),
          LARGE: config.get('PRICING_SIZE_FEE_LARGE', { infer: true }),
        },
        platformRate: config.get('PRICING_PLATFORM_RATE', { infer: true }),
      }),
    },
    {
      // composition root del Strategy: agregar un tipo = registrar aquí su clase
      provide: FulfillmentStrategyResolver,
      useFactory: () => new FulfillmentStrategyResolver([new BuyerShipsToTravelerStrategy()]),
    },
    OrdersCoordinationService,
    ActivateBuyerProfileUseCase,
    CreateOrderUseCase,
    ConfirmPurchaseUseCase,
    ConfirmDeliveryUseCase,
    CancelOrderUseCase,
    ListMyOrdersUseCase,
    GetMyOrderUseCase,
  ],
  exports: [OrdersCoordinationService, PRICING_CONFIG],
})
export class OrdersModule {}
