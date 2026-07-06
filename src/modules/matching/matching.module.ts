import {
  forwardRef,
  Logger,
  Module,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables, NodeEnv } from '../../core/config/env.validation';
import { ORDER_ASSIGNMENTS_PORT } from '../orders/domain/ports/order-assignments.port';
import { OrdersModule } from '../orders/orders.module';
import { TRIP_ASSIGNMENTS_PORT } from '../trips/domain/ports/trip-assignments.port';
import { TripsModule } from '../trips/trips.module';
import {
  MatchingOrderAssignmentsAdapter,
  MatchingTripAssignmentsAdapter,
} from './application/adapters/inverted-ports.adapters';
import { MatchingTriggersListener } from './application/matching-triggers.listener';
import { AssignmentResponseService } from './application/use-cases/assignment-response.use-cases';
import { RunMatchingForOrderUseCase } from './application/use-cases/run-matching-for-order.use-case';
import { ASSIGNMENT_REPOSITORY } from './domain/repositories/assignment.repository';
import { MATCHING_CONFIG, MatchingConfig } from './domain/services/matching-policy';
import { PrismaAssignmentRepository } from './infrastructure/persistence/prisma/prisma-assignment.repository';
import { AssignmentsController } from './interface/http/controllers/assignments.controller';

/**
 * HUB del monolito: único módulo que depende de orders Y trips
 * (docs/design/02-arquitectura.md). Los ciclos con orders/trips existen solo
 * por los puertos invertidos de cancelación → forwardRef.
 */
@Module({
  imports: [forwardRef(() => OrdersModule), forwardRef(() => TripsModule)],
  controllers: [AssignmentsController],
  providers: [
    { provide: ASSIGNMENT_REPOSITORY, useClass: PrismaAssignmentRepository },
    {
      // parámetros del motor: config validada al arranque, nunca hardcode
      provide: MATCHING_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>): MatchingConfig => ({
        reputationMin: config.get('MATCH_REPUTATION_MIN', { infer: true }),
        reputationColdStart: config.get('MATCH_REPUTATION_COLD_START', { infer: true }),
        weights: {
          time: config.get('MATCH_W_TIME', { infer: true }),
          reputation: config.get('MATCH_W_REPUTATION', { infer: true }),
          capacity: config.get('MATCH_W_CAPACITY', { infer: true }),
          fairness: config.get('MATCH_W_FAIRNESS', { infer: true }),
          load: config.get('MATCH_W_LOAD', { infer: true }),
        },
        acceptanceWindowMinutes: config.get('MATCH_ACCEPTANCE_WINDOW_MINUTES', { infer: true }),
        maxReassignAttempts: config.get('MATCH_MAX_REASSIGN_ATTEMPTS', { infer: true }),
        maxCandidates: config.get('MATCH_MAX_CANDIDATES', { infer: true }),
        maxParallelPerTraveler: config.get('MATCH_MAX_PARALLEL_PER_TRAVELER', { infer: true }),
      }),
    },
    RunMatchingForOrderUseCase,
    AssignmentResponseService,
    MatchingTriggersListener,
    { provide: ORDER_ASSIGNMENTS_PORT, useClass: MatchingOrderAssignmentsAdapter },
    { provide: TRIP_ASSIGNMENTS_PORT, useClass: MatchingTripAssignmentsAdapter },
  ],
  exports: [ORDER_ASSIGNMENTS_PORT, TRIP_ASSIGNMENTS_PORT],
})
export class MatchingModule implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MatchingModule.name);
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly responses: AssignmentResponseService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  /** Red de seguridad: barrido periódico de ofertas vencidas (§5 fallback). */
  onApplicationBootstrap(): void {
    if (this.config.get('NODE_ENV', { infer: true }) === NodeEnv.Test) {
      return;
    }
    this.sweepTimer = setInterval(() => {
      void this.responses.expireStaleOffers().catch((error: Error) => {
        this.logger.warn({ err: error.message }, 'Expire sweep failed');
      });
    }, 60_000);
    this.sweepTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
    }
  }
}
