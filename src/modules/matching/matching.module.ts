import { forwardRef, Module } from '@nestjs/common';
import { ORDER_ASSIGNMENTS_PORT } from '../orders/domain/ports/order-assignments.port';
import { OrdersModule } from '../orders/orders.module';
import { TRIP_ASSIGNMENTS_PORT } from '../trips/domain/ports/trip-assignments.port';
import { TripsModule } from '../trips/trips.module';
import {
  MatchingOrderAssignmentsAdapter,
  MatchingTripAssignmentsAdapter,
} from './application/adapters/inverted-ports.adapters';
import { MatchingReadService } from './application/matching-read.service';
import { AssignmentResponseService } from './application/use-cases/assignment-response.use-cases';
import { ClaimService } from './application/use-cases/claim.use-cases';
import { ASSIGNMENT_REPOSITORY } from './domain/repositories/assignment.repository';
import { PrismaAssignmentRepository } from './infrastructure/persistence/prisma/prisma-assignment.repository';
import { AssignmentsController } from './interface/http/controllers/assignments.controller';
import { TripOrdersController } from './interface/http/controllers/trip-orders.controller';

/**
 * HUB del monolito, ahora en modelo DISCOVERY + CLAIM
 * (docs/design/09-modelo-claim-y-pricing.md): el Traveler explora encargos
 * compatibles con su viaje y los reclama. Se eliminaron el scoring, los
 * triggers por eventos y el barrido de expiración del modelo anterior.
 * Los ciclos con orders/trips existen solo por los puertos invertidos → forwardRef.
 */
@Module({
  imports: [forwardRef(() => OrdersModule), forwardRef(() => TripsModule)],
  controllers: [AssignmentsController, TripOrdersController],
  providers: [
    { provide: ASSIGNMENT_REPOSITORY, useClass: PrismaAssignmentRepository },
    ClaimService,
    AssignmentResponseService,
    MatchingReadService,
    { provide: ORDER_ASSIGNMENTS_PORT, useClass: MatchingOrderAssignmentsAdapter },
    { provide: TRIP_ASSIGNMENTS_PORT, useClass: MatchingTripAssignmentsAdapter },
  ],
  exports: [ORDER_ASSIGNMENTS_PORT, TRIP_ASSIGNMENTS_PORT, MatchingReadService],
})
export class MatchingModule {}
