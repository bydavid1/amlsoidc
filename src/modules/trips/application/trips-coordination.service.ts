import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';

/**
 * API publicada de trips para el hub `matching`
 * (docs/design/02-arquitectura.md — TripsCapacityApi):
 * candidatos para el matching + reserva/liberación ATÓMICA de capacidad.
 */
export interface CandidateTrip {
  tripId: string;
  travelerProfileId: string;
  travelerUserId: string;
  arrivalDate: Date;
  totalCapacity: number;
  remainingCapacity: number;
  reputationScore: number;
  reputationCount: number;
}

export interface CandidateCriteria {
  originCountryId: string;
  destinationCountryId: string;
  requiredCapacity: number;
  minArrival: Date;
  maxArrival: Date | null;
  excludeTravelerProfileIds: string[];
  excludeUserId: string;
  reputationMin: number;
  limit: number;
}

@Injectable()
export class TripsCoordinationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Filtros duros H1–H7 del matching (docs/design/06-matching.md §2). */
  async findCandidateTrips(criteria: CandidateCriteria): Promise<CandidateTrip[]> {
    const rows = await this.prisma.client.trip.findMany({
      where: {
        originCountryId: criteria.originCountryId,
        destinationCountryId: criteria.destinationCountryId,
        status: 'OPEN',
        deletedAt: null,
        arrivalDate: {
          gte: criteria.minArrival,
          ...(criteria.maxArrival ? { lte: criteria.maxArrival } : {}),
        },
        remainingCapacity: { gte: criteria.requiredCapacity },
        ...(criteria.excludeTravelerProfileIds.length > 0
          ? { travelerProfileId: { notIn: criteria.excludeTravelerProfileIds } }
          : {}),
        travelerProfile: {
          deletedAt: null,
          userId: { not: criteria.excludeUserId },
          user: { status: 'ACTIVE', deletedAt: null },
          // umbral configurable; Travelers sin calificaciones pasan (cold-start)
          OR: [
            { reputationCount: 0 },
            { reputationScore: { gte: criteria.reputationMin } },
          ],
        },
      },
      include: { travelerProfile: true },
      orderBy: [{ arrivalDate: 'asc' }, { id: 'asc' }],
      take: criteria.limit,
    });

    return rows.map((r) => ({
      tripId: r.id,
      travelerProfileId: r.travelerProfileId,
      travelerUserId: r.travelerProfile.userId,
      arrivalDate: r.arrivalDate,
      totalCapacity: r.totalCapacity,
      remainingCapacity: r.remainingCapacity,
      reputationScore: Number(r.travelerProfile.reputationScore),
      reputationCount: r.travelerProfile.reputationCount,
    }));
  }

  /**
   * Reserva atómica: decremento condicional; devuelve false si ya no hay
   * capacidad (otro pedido ganó la carrera) — docs/design/06-matching.md §6.
   */
  async reserveCapacity(tripId: string, units: number): Promise<boolean> {
    const result = await this.prisma.client.trip.updateMany({
      where: { id: tripId, status: 'OPEN', deletedAt: null, remainingCapacity: { gte: units } },
      data: { remainingCapacity: { decrement: units } },
    });
    return result.count === 1;
  }

  async releaseCapacity(tripId: string, units: number): Promise<void> {
    await this.prisma.client.trip.updateMany({
      where: { id: tripId, deletedAt: null },
      data: { remainingCapacity: { increment: units } },
    });
  }

  async getTravelerUserId(travelerProfileId: string): Promise<string | null> {
    const row = await this.prisma.client.travelerProfile.findFirst({
      where: { id: travelerProfileId, deletedAt: null },
      select: { userId: true },
    });
    return row?.userId ?? null;
  }
}
