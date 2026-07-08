import { Injectable } from '@nestjs/common';
import { Trip as PrismaTrip } from '@prisma/client';
import { PrismaService } from '../../../../../core/prisma/prisma.service';
import { CursorRef } from '../../../../../shared/http/cursor-pagination';
import { Trip, TripStatus } from '../../../domain/entities/trip.entity';
import {
  TripListRow,
  TripRepository,
} from '../../../domain/repositories/trip.repository';

function toDomain(row: PrismaTrip): Trip {
  return Trip.restore({
    id: row.id,
    travelerProfileId: row.travelerProfileId,
    originCountryId: row.originCountryId,
    destinationCountryId: row.destinationCountryId,
    destinationCityId: row.destinationCityId,
    arrivalDate: row.arrivalDate,
    status: row.status as TripStatus,
  });
}

@Injectable()
export class PrismaTripRepository implements TripRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Trip | null> {
    const row = await this.prisma.client.trip.findFirst({ where: { id, deletedAt: null } });
    return row ? toDomain(row) : null;
  }

  async save(trip: Trip): Promise<void> {
    const data = {
      travelerProfileId: trip.travelerProfileId,
      originCountryId: trip.originCountryId,
      destinationCountryId: trip.destinationCountryId,
      destinationCityId: trip.destinationCityId,
      arrivalDate: trip.arrivalDate,
      status: trip.status,
    };
    await this.prisma.client.trip.upsert({
      where: { id: trip.id },
      create: { id: trip.id, ...data },
      update: data,
    });
  }

  async listByTraveler(
    travelerProfileId: string,
    limit: number,
    cursor: CursorRef | null,
    status?: TripStatus,
  ): Promise<TripListRow[]> {
    const rows = await this.prisma.client.trip.findMany({
      where: {
        travelerProfileId,
        deletedAt: null,
        ...(status ? { status } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1, // +1 para saber si hay página siguiente
    });
    return rows.map((r) => ({
      id: r.id,
      originCountryId: r.originCountryId,
      destinationCountryId: r.destinationCountryId,
      destinationCityId: r.destinationCityId,
      arrivalDate: r.arrivalDate,
      status: r.status as TripStatus,
      createdAt: r.createdAt,
    }));
  }
}
