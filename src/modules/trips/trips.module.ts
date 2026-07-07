import { forwardRef, Module } from '@nestjs/common';
import { GeographyModule } from '../geography/geography.module';
import { IdentityModule } from '../identity/identity.module';
import { MatchingModule } from '../matching/matching.module';
import { ReputationSnapshotListener } from './application/reputation-snapshot.listener';
import { TripsCoordinationService } from './application/trips-coordination.service';
import {
  ActivateTravelerProfileUseCase,
  CancelTripUseCase,
  CreateTripUseCase,
  ListMyTripsUseCase,
  PublishTripUseCase,
} from './application/use-cases/trips.use-cases';
import { TRAVELER_PROFILE_REPOSITORY } from './domain/repositories/traveler-profile.repository';
import { TRIP_REPOSITORY } from './domain/repositories/trip.repository';
import { PrismaTravelerProfileRepository } from './infrastructure/persistence/prisma/prisma-traveler-profile.repository';
import { PrismaTripRepository } from './infrastructure/persistence/prisma/prisma-trip.repository';
import { TravelerProfileController } from './interface/http/controllers/traveler-profile.controller';
import { TripsController } from './interface/http/controllers/trips.controller';

/**
 * forwardRef: trips ⟷ matching es el único ciclo permitido (puerto invertido
 * TRIP_ASSIGNMENTS_PORT que matching implementa) — docs/design/02-arquitectura.md.
 */
@Module({
  imports: [GeographyModule, IdentityModule, forwardRef(() => MatchingModule)],
  controllers: [TripsController, TravelerProfileController],
  providers: [
    { provide: TRIP_REPOSITORY, useClass: PrismaTripRepository },
    { provide: TRAVELER_PROFILE_REPOSITORY, useClass: PrismaTravelerProfileRepository },
    TripsCoordinationService,
    ReputationSnapshotListener,
    ActivateTravelerProfileUseCase,
    CreateTripUseCase,
    PublishTripUseCase,
    CancelTripUseCase,
    ListMyTripsUseCase,
  ],
  exports: [TripsCoordinationService, TRAVELER_PROFILE_REPOSITORY],
})
export class TripsModule {}
