import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { AdminQueryService } from './application/admin-query.service';
import { AdminController } from './interface/http/controllers/admin.controller';

@Module({
  imports: [IdentityModule, IncidentsModule],
  controllers: [AdminController],
  providers: [AdminQueryService],
})
export class AdminModule {}
