import { Module } from '@nestjs/common';
import { CoreModule } from './core/core.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { GeographyModule } from './modules/geography/geography.module';
import { IdentityModule } from './modules/identity/identity.module';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { MatchingModule } from './modules/matching/matching.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ReputationModule } from './modules/reputation/reputation.module';
import { TripsModule } from './modules/trips/trips.module';

@Module({
  imports: [
    CoreModule,
    GeographyModule,
    IdentityModule,
    AuthModule,
    TripsModule,
    OrdersModule,
    CatalogModule,
    MatchingModule,
    ReputationModule,
    IncidentsModule,
    NotificationsModule,
    AuditModule,
    AdminModule,
  ],
})
export class AppModule {}
