import { CursorRef } from '../../../../shared/http/cursor-pagination';
import { Trip, TripStatus } from '../entities/trip.entity';

export const TRIP_REPOSITORY = Symbol('TRIP_REPOSITORY');

export interface TripListRow {
  id: string;
  originCountryId: string;
  destinationCountryId: string;
  destinationCityId: string | null;
  arrivalDate: Date;
  status: TripStatus;
  createdAt: Date;
}

export interface TripRepository {
  findById(id: string): Promise<Trip | null>;
  save(trip: Trip): Promise<void>;
  listByTraveler(
    travelerProfileId: string,
    limit: number,
    cursor: CursorRef | null,
    status?: TripStatus,
  ): Promise<TripListRow[]>;
}
