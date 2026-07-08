import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../../../shared/domain/domain-error';
import { Clock, CLOCK } from '../../../../shared/domain/ports/clock';
import { EVENT_BUS, EventBus } from '../../../../shared/domain/ports/event-bus';
import { ID_GENERATOR, IdGenerator } from '../../../../shared/domain/ports/id-generator';
import { UNIT_OF_WORK, UnitOfWork } from '../../../../shared/domain/ports/unit-of-work';
import { CursorRef } from '../../../../shared/http/cursor-pagination';
import {
  CORRIDOR_POLICY,
  CorridorPolicy,
} from '../../../geography/domain/services/corridor-policy';
import { IdentityAccessService } from '../../../identity/application/identity-access.service';
import { Trip, TripStatus } from '../../domain/entities/trip.entity';
import {
  TRIP_ASSIGNMENTS_PORT,
  TripAssignmentsPort,
} from '../../domain/ports/trip-assignments.port';
import {
  TRAVELER_PROFILE_REPOSITORY,
  TravelerProfileRepository,
  TravelerProfileView,
} from '../../domain/repositories/traveler-profile.repository';
import {
  TRIP_REPOSITORY,
  TripListRow,
  TripRepository,
} from '../../domain/repositories/trip.repository';

@Injectable()
export class ActivateTravelerProfileUseCase {
  constructor(
    @Inject(TRAVELER_PROFILE_REPOSITORY) private readonly profiles: TravelerProfileRepository,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    private readonly identityAccess: IdentityAccessService,
  ) {}

  /** Idempotente: activar dos veces devuelve el mismo perfil. */
  execute(userId: string): Promise<TravelerProfileView> {
    return this.uow.execute(async () => {
      const existing = await this.profiles.findByUserId(userId);
      if (existing) {
        return existing;
      }
      const profile = await this.profiles.create({ id: this.ids.next(), userId });
      await this.identityAccess.grantRole(userId, 'TRAVELER');
      return profile;
    });
  }
}

export interface CreateTripCommand {
  userId: string;
  originCountryId: string;
  destinationCountryId: string;
  destinationCityId: string | null;
  arrivalDate: Date;
}

@Injectable()
export class CreateTripUseCase {
  constructor(
    @Inject(TRIP_REPOSITORY) private readonly trips: TripRepository,
    @Inject(TRAVELER_PROFILE_REPOSITORY) private readonly profiles: TravelerProfileRepository,
    @Inject(CORRIDOR_POLICY) private readonly corridors: CorridorPolicy,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: CreateTripCommand): Promise<Trip> {
    const profile = await this.requireProfile(command.userId);

    const enabled = await this.corridors.isEnabled(
      command.originCountryId,
      command.destinationCountryId,
    );
    if (!enabled) {
      throw new DomainError(
        'CORRIDOR_NOT_ENABLED',
        'This corridor is not enabled yet',
        'UNPROCESSABLE',
      );
    }

    const trip = Trip.create({
      id: this.ids.next(),
      travelerProfileId: profile.id,
      originCountryId: command.originCountryId,
      destinationCountryId: command.destinationCountryId,
      destinationCityId: command.destinationCityId,
      arrivalDate: command.arrivalDate,
      now: this.clock.now(),
    });
    await this.trips.save(trip);
    return trip;
  }

  private async requireProfile(userId: string): Promise<TravelerProfileView> {
    const profile = await this.profiles.findByUserId(userId);
    if (!profile) {
      throw new DomainError(
        'TRAVELER_PROFILE_REQUIRED',
        'Activate your traveler profile first',
        'FORBIDDEN',
      );
    }
    return profile;
  }
}

@Injectable()
export class PublishTripUseCase {
  constructor(
    @Inject(TRIP_REPOSITORY) private readonly trips: TripRepository,
    @Inject(TRAVELER_PROFILE_REPOSITORY) private readonly profiles: TravelerProfileRepository,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(userId: string, tripId: string): Promise<Trip> {
    const trip = await loadOwnedTrip(this.trips, this.profiles, userId, tripId);
    trip.publish(this.clock.now());
    await this.trips.save(trip);
    // el evento dispara el re-matching de Orders pendientes del corredor
    await this.eventBus.publishAll(trip.pullDomainEvents());
    return trip;
  }
}

@Injectable()
export class CancelTripUseCase {
  constructor(
    @Inject(TRIP_REPOSITORY) private readonly trips: TripRepository,
    @Inject(TRAVELER_PROFILE_REPOSITORY) private readonly profiles: TravelerProfileRepository,
    @Inject(TRIP_ASSIGNMENTS_PORT) private readonly assignments: TripAssignmentsPort,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Cancela el viaje y sus assignments activos en UNA transacción (hub matching vía puerto invertido). */
  async execute(userId: string, tripId: string): Promise<{ affectedOrderIds: string[] }> {
    const result = await this.uow.execute(async () => {
      const trip = await loadOwnedTrip(this.trips, this.profiles, userId, tripId);
      trip.cancel(this.clock.now());
      await this.trips.save(trip);
      const affectedOrderIds = await this.assignments.cancelAssignmentsForTrip(tripId);
      return { trip, affectedOrderIds };
    });
    await this.eventBus.publishAll(result.trip.pullDomainEvents());
    return { affectedOrderIds: result.affectedOrderIds };
  }
}

@Injectable()
export class ListMyTripsUseCase {
  constructor(
    @Inject(TRIP_REPOSITORY) private readonly trips: TripRepository,
    @Inject(TRAVELER_PROFILE_REPOSITORY) private readonly profiles: TravelerProfileRepository,
  ) {}

  async execute(
    userId: string,
    limit: number,
    cursor: CursorRef | null,
    status?: TripStatus,
  ): Promise<TripListRow[]> {
    const profile = await this.profiles.findByUserId(userId);
    if (!profile) {
      return [];
    }
    return this.trips.listByTraveler(profile.id, limit, cursor, status);
  }
}

async function loadOwnedTrip(
  trips: TripRepository,
  profiles: TravelerProfileRepository,
  userId: string,
  tripId: string,
): Promise<Trip> {
  const trip = await trips.findById(tripId);
  if (!trip) {
    throw new DomainError('NOT_FOUND', 'Trip not found', 'NOT_FOUND');
  }
  // autorización a nivel de RECURSO: el guard valida el rol, aquí el dueño
  const profile = await profiles.findByUserId(userId);
  if (!profile || trip.travelerProfileId !== profile.id) {
    throw new DomainError('NOT_FOUND', 'Trip not found', 'NOT_FOUND');
  }
  return trip;
}
