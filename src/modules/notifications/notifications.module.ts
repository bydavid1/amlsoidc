import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { TripsModule } from '../trips/trips.module';
import { NotificationsListener } from './application/notifications.listener';
import { NotificationsService } from './application/notifications.service';
import { NotificationsController } from './interface/http/controllers/notifications.controller';

@Module({
  imports: [OrdersModule, TripsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsListener],
})
export class NotificationsModule {}
