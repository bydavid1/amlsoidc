import { Inject, Injectable, Logger } from '@nestjs/common';
import { Clock, CLOCK } from '../../../../shared/domain/ports/clock';
import { EVENT_BUS, EventBus } from '../../../../shared/domain/ports/event-bus';
import { ID_GENERATOR, IdGenerator } from '../../../../shared/domain/ports/id-generator';
import { UNIT_OF_WORK, UnitOfWork } from '../../../../shared/domain/ports/unit-of-work';
import { OrdersCoordinationService } from '../../../orders/application/orders-coordination.service';
import { TripsCoordinationService } from '../../../trips/application/trips-coordination.service';
import { Assignment } from '../../domain/entities/assignment.entity';
import {
  ASSIGNMENT_REPOSITORY,
  AssignmentRepository,
} from '../../domain/repositories/assignment.repository';
import {
  MATCHING_CONFIG,
  MatchingConfig,
  rankCandidates,
} from '../../domain/services/matching-policy';

/**
 * Núcleo del motor (docs/design/06-matching.md): filtros duros → scoring →
 * oferta 1-a-1 al mejor candidato con reserva ATÓMICA de capacidad.
 * Si la reserva falla (carrera), se intenta el siguiente candidato del ranking.
 */
@Injectable()
export class RunMatchingForOrderUseCase {
  private readonly logger = new Logger(RunMatchingForOrderUseCase.name);

  constructor(
    @Inject(ASSIGNMENT_REPOSITORY) private readonly assignments: AssignmentRepository,
    @Inject(MATCHING_CONFIG) private readonly config: MatchingConfig,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ordersCoordination: OrdersCoordinationService,
    private readonly tripsCoordination: TripsCoordinationService,
  ) {}

  async execute(orderId: string): Promise<Assignment | null> {
    const now = this.clock.now();

    const order = await this.ordersCoordination.getMatchableOrder(orderId);
    if (!order || order.status !== 'PENDING_ASSIGNMENT') {
      return null;
    }
    if (await this.assignments.findActiveByOrder(orderId)) {
      return null; // ya hay una oferta activa
    }

    // tope de reintentos: pedidos sin aceptación expiran (caso borde §9)
    const attempts = await this.assignments.countForOrder(orderId);
    if (attempts >= this.config.maxReassignAttempts) {
      await this.uow.execute(() => this.ordersCoordination.expireOrder(orderId));
      this.logger.log({ orderId, attempts }, 'Order expired after max reassign attempts');
      return null;
    }

    // H8: no re-ofrecer a Travelers que ya recibieron oferta de este pedido
    const excludedProfiles = await this.assignments.travelerProfileIdsForOrder(orderId);

    const candidates = await this.tripsCoordination.findCandidateTrips({
      originCountryId: order.originCountryId,
      destinationCountryId: order.destinationCountryId,
      requiredCapacity: order.requiredCapacity,
      minArrival: now,
      maxArrival: order.neededBy,
      excludeTravelerProfileIds: excludedProfiles,
      excludeUserId: order.buyerUserId, // H7: nadie se auto-asigna
      reputationMin: this.config.reputationMin,
      limit: this.config.maxCandidates,
    });
    if (candidates.length === 0) {
      return null; // sin candidatos: el pedido espera (TripPublished lo re-evalúa)
    }

    const loads = await this.assignments.countActiveByTraveler(
      candidates.map((c) => c.travelerProfileId),
    );
    const ranked = rankCandidates(
      order,
      candidates.map((c) => ({ ...c, activeLoad: loads.get(c.travelerProfileId) ?? 0 })),
      this.config,
      now,
    );

    for (const { candidate, breakdown } of ranked) {
      const created = await this.uow.execute(async () => {
        const reserved = await this.tripsCoordination.reserveCapacity(
          candidate.tripId,
          order.requiredCapacity,
        );
        if (!reserved) {
          return null; // otro pedido ganó la carrera por esa capacidad
        }
        const assignment = Assignment.offer({
          id: this.ids.next(),
          orderId,
          tripId: candidate.tripId,
          travelerProfileId: candidate.travelerProfileId,
          scoreBreakdown: breakdown,
          now,
          expiresAt: new Date(now.getTime() + this.config.acceptanceWindowMinutes * 60_000),
        });
        await this.assignments.save(assignment);
        return assignment;
      });

      if (created) {
        await this.eventBus.publishAll(created.pullDomainEvents());
        this.logger.log(
          { orderId, tripId: created.tripId, score: created.scoreBreakdown?.total },
          'Assignment offered',
        );
        return created;
      }
    }
    return null;
  }
}
