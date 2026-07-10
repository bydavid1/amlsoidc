import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import {
  ASSIGNMENT_REPOSITORY,
  AssignmentRepository,
} from '../domain/repositories/assignment.repository';

/** Percepción sin contacto: solo nombre de pila + reputación, NUNCA teléfono. */
export interface TravelerPublicInfo {
  firstName: string | null;
  reputationScore: number;
  reputationCount: number;
}

/**
 * Lecturas publicadas de matching para otros módulos (orders, reputation,
 * incidents, notifications): quién lleva un pedido.
 */
@Injectable()
export class MatchingReadService {
  constructor(
    @Inject(ASSIGNMENT_REPOSITORY) private readonly assignments: AssignmentRepository,
    private readonly prisma: PrismaService,
  ) {}

  async getAcceptedTravelerProfileId(orderId: string): Promise<string | null> {
    const active = await this.assignments.findActiveByOrder(orderId);
    return active?.status === 'ACCEPTED' ? active.travelerProfileId : null;
  }

  /** Datos PÚBLICOS del traveler asignado (modelo hub: sin contacto). */
  async getAssignedTravelerPublicInfo(orderId: string): Promise<TravelerPublicInfo | null> {
    const profileId = await this.getAcceptedTravelerProfileId(orderId);
    if (!profileId) {
      return null;
    }
    const profile = await this.prisma.client.travelerProfile.findFirst({
      where: { id: profileId, deletedAt: null },
      select: {
        reputationScore: true,
        reputationCount: true,
        user: { select: { firstName: true } },
      },
    });
    if (!profile) {
      return null;
    }
    return {
      firstName: profile.user.firstName,
      reputationScore: Number(profile.reputationScore),
      reputationCount: profile.reputationCount,
    };
  }
}
