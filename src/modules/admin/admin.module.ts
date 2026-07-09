import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { IdentityModule } from '../identity/identity.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { AdminQueryService } from './application/admin-query.service';
import { AdminController } from './interface/http/controllers/admin.controller';

@Module({
  imports: [IdentityModule, IncidentsModule, CatalogModule],
  controllers: [AdminController],
  providers: [AdminQueryService],
})
export class AdminModule {}
