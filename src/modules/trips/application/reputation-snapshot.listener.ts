import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../core/prisma/prisma.service';

interface ReputationUpdatedPayload {
  payload: { userId: string; average: number; count: number };
}

/**
 * Actualiza el snapshot cacheado de reputación en TravelerProfile.
 * Se suscribe por NOMBRE de evento ('reputation.updated') a propósito:
 * trips depende de reputation SOLO por evento, sin import de módulo
 * (docs/design/02-arquitectura.md — evita el ciclo trips→reputation→matching→trips).
 * La fuente de verdad sigue siendo la tabla de ratings de reputation.
 */
@Injectable()
export class ReputationSnapshotListener {
  private readonly logger = new Logger(ReputationSnapshotListener.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('reputation.updated', { promisify: true })
  async onReputationUpdated(event: ReputationUpdatedPayload): Promise<void> {
    const { userId, average, count } = event.payload;
    try {
      await this.prisma.client.travelerProfile.updateMany({
        where: { userId, deletedAt: null },
        data: { reputationScore: average, reputationCount: count },
      });
    } catch (error) {
      this.logger.warn(
        { userId, err: (error as Error).message },
        'Failed to update reputation snapshot',
      );
    }
  }
}
