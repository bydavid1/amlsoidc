import { Module } from '@nestjs/common';
import { MatchingModule } from '../matching/matching.module';
import { OrdersModule } from '../orders/orders.module';
import { TripsModule } from '../trips/trips.module';
import {
  ListDisputesUseCase,
  ReportIssueUseCase,
  ResolveDisputeUseCase,
} from './application/use-cases/incidents.use-cases';
import { DISPUTE_REPOSITORY } from './domain/repositories/dispute.repository';
import { PrismaDisputeRepository } from './infrastructure/persistence/prisma/prisma-dispute.repository';
import { ReportIssueController } from './interface/http/controllers/report-issue.controller';

@Module({
  imports: [OrdersModule, TripsModule, MatchingModule],
  controllers: [ReportIssueController],
  providers: [
    { provide: DISPUTE_REPOSITORY, useClass: PrismaDisputeRepository },
    ReportIssueUseCase,
    ResolveDisputeUseCase,
    ListDisputesUseCase,
  ],
  // admin compone estos casos de uso con permisos elevados
  exports: [ResolveDisputeUseCase, ListDisputesUseCase],
})
export class IncidentsModule {}
