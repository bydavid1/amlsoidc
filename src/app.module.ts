import { Module } from '@nestjs/common';
import { CoreModule } from './core/core.module';
import { AuthModule } from './modules/auth/auth.module';
import { GeographyModule } from './modules/geography/geography.module';
import { IdentityModule } from './modules/identity/identity.module';
import { MatchingModule } from './modules/matching/matching.module';
import { OrdersModule } from './modules/orders/orders.module';
import { TripsModule } from './modules/trips/trips.module';

@Module({
  imports: [
    CoreModule,
    GeographyModule,
    IdentityModule,
    AuthModule,
    TripsModule,
    OrdersModule,
    MatchingModule,
  ],
})
export class AppModule {}
