import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';

/**
 * API publicada de trips para el módulo `matching` (discovery + claim):
 * datos del viaje para validar un claim y resolución de userIds.
 * (docs/design/09-modelo-claim-y-pricing.md)
 */
export interface ClaimableTripView {
  id: string;
  travelerProfileId: string;
  travelerUserId: string;
  originCountryId: string;
  destinationCountryId: string;
  arrivalDate: Date;
  status: string;
}

@Injectable()
export class TripsCoordinationService {
  constructor(private readonly prisma: PrismaService) {}

  async getClaimableTrip(tripId: string): Promise<ClaimableTripView | null> {
    const row = await this.prisma.client.trip.findFirst({
      where: { id: tripId, deletedAt: null },
      include: { travelerProfile: { select: { userId: true } } },
    });
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      travelerProfileId: row.travelerProfileId,
      travelerUserId: row.travelerProfile.userId,
      originCountryId: row.originCountryId,
      destinationCountryId: row.destinationCountryId,
      arrivalDate: row.arrivalDate,
      status: row.status,
    };
  }

  async getTravelerUserId(travelerProfileId: string): Promise<string | null> {
    const row = await this.prisma.client.travelerProfile.findFirst({
      where: { id: travelerProfileId, deletedAt: null },
      select: { userId: true },
    });
    return row?.userId ?? null;
  }
}
