import { Inject, Injectable, Logger } from '@nestjs/common';
import { DomainError } from '../../../../shared/domain/domain-error';
import { Clock, CLOCK } from '../../../../shared/domain/ports/clock';
import { EVENT_BUS, EventBus } from '../../../../shared/domain/ports/event-bus';
import { UNIT_OF_WORK, UnitOfWork } from '../../../../shared/domain/ports/unit-of-work';
import { OrdersCoordinationService } from '../../../orders/application/orders-coordination.service';
import { TripsCoordinationService } from '../../../trips/application/trips-coordination.service';
import {
  TRAVELER_PROFILE_REPOSITORY,
  TravelerProfileRepository,
} from '../../../trips/domain/repositories/traveler-profile.repository';
import { Assignment } from '../../domain/entities/assignment.entity';
import {
  ASSIGNMENT_REPOSITORY,
  AssignmentRepository,
  AssignmentListRow,
} from '../../domain/repositories/assignment.repository';
import { RunMatchingForOrderUseCase } from './run-matching-for-order.use-case';

/**
 * Respuesta del Traveler a la oferta + acciones del flujo de entrega.
 * Accept/Reject tocan Order+Assignment+Trip en UNA transacción (hub matching,
 * docs/design/02-arquitectura.md).
 */
@Injectable()
export class AssignmentResponseService {
  private readonly logger = new Logger(AssignmentResponseService.name);

  constructor(
    @Inject(ASSIGNMENT_REPOSITORY) private readonly assignments: AssignmentRepository,
    @Inject(TRAVELER_PROFILE_REPOSITORY) private readonly profiles: TravelerProfileRepository,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ordersCoordination: OrdersCoordinationService,
    private readonly tripsCoordination: TripsCoordinationService,
    private readonly runMatching: RunMatchingForOrderUseCase,
  ) {}

  async accept(userId: string, assignmentId: string): Promise<Assignment> {
    const now = this.clock.now();
    const assignment = await this.uow.execute(async () => {
      const a = await this.loadOwned(userId, assignmentId);
      if (a.isExpired(now)) {
        // expiración perezosa: se procesa como EXPIRED y se re-matchea
        await this.expireInTransaction(a, now);
        throw new DomainError('ASSIGNMENT_EXPIRED', 'The offer has expired', 'CONFLICT');
      }
      a.accept(now);
      await this.assignments.save(a);
      // la capacidad ya quedó reservada al ofertar; ahora es firme
      await this.ordersCoordination.markAssigned(a.orderId, `traveler:${userId}`);
      return a;
    });
    await this.eventBus.publishAll(assignment.pullDomainEvents());
    return assignment;
  }

  async reject(userId: string, assignmentId: string): Promise<Assignment> {
    const assignment = await this.uow.execute(async () => {
      const a = await this.loadOwned(userId, assignmentId);
      a.reject(this.clock.now());
      await this.assignments.save(a);
      await this.releaseCapacity(a);
      return a;
    });
    await this.eventBus.publishAll(assignment.pullDomainEvents());
    // fallback al siguiente candidato (el rechazado queda excluido por H8)
    await this.rematchSafely(assignment.orderId);
    return assignment;
  }

  /** Acciones del flujo de entrega (Traveler) — delegan la transición al agregado Order. */
  async markReceived(userId: string, assignmentId: string): Promise<void> {
    const a = await this.loadOwnedAccepted(userId, assignmentId);
    await this.ordersCoordination.markReceivedByTraveler(a.orderId, `traveler:${userId}`);
  }

  async markInTransit(userId: string, assignmentId: string): Promise<void> {
    const a = await this.loadOwnedAccepted(userId, assignmentId);
    await this.ordersCoordination.markInTransit(a.orderId, `traveler:${userId}`);
  }

  async markArrived(userId: string, assignmentId: string): Promise<void> {
    const a = await this.loadOwnedAccepted(userId, assignmentId);
    await this.ordersCoordination.markArrived(a.orderId, `traveler:${userId}`);
  }

  async listMine(userId: string, limit: number): Promise<AssignmentListRow[]> {
    const profile = await this.profiles.findByUserId(userId);
    if (!profile) {
      return [];
    }
    return this.assignments.listByTraveler(profile.id, limit);
  }

  /** Barrido de ofertas vencidas (disparado por intervalo). */
  async expireStaleOffers(): Promise<number> {
    const now = this.clock.now();
    const stale = await this.assignments.findExpiredOffers(now, 50);
    for (const assignment of stale) {
      try {
        await this.uow.execute(() => this.expireInTransaction(assignment, now));
        await this.eventBus.publishAll(assignment.pullDomainEvents());
        await this.rematchSafely(assignment.orderId);
      } catch (error) {
        this.logger.warn(
          { assignmentId: assignment.id, err: (error as Error).message },
          'Failed to expire assignment',
        );
      }
    }
    return stale.length;
  }

  private async expireInTransaction(assignment: Assignment, now: Date): Promise<void> {
    assignment.expire(now);
    await this.assignments.save(assignment);
    await this.releaseCapacity(assignment);
  }

  private async releaseCapacity(assignment: Assignment): Promise<void> {
    const order = await this.ordersCoordination.getMatchableOrder(assignment.orderId);
    await this.tripsCoordination.releaseCapacity(
      assignment.tripId,
      order?.requiredCapacity ?? 1,
    );
  }

  private async rematchSafely(orderId: string): Promise<void> {
    try {
      await this.runMatching.execute(orderId);
    } catch (error) {
      this.logger.warn({ orderId, err: (error as Error).message }, 'Re-matching failed');
    }
  }

  private async loadOwned(userId: string, assignmentId: string): Promise<Assignment> {
    const assignment = await this.assignments.findById(assignmentId);
    if (!assignment) {
      throw new DomainError('NOT_FOUND', 'Assignment not found', 'NOT_FOUND');
    }
    const profile = await this.profiles.findByUserId(userId);
    // 404 también si no es el destinatario (no revelar recursos ajenos)
    if (!profile || assignment.travelerProfileId !== profile.id) {
      throw new DomainError('NOT_FOUND', 'Assignment not found', 'NOT_FOUND');
    }
    return assignment;
  }

  private async loadOwnedAccepted(userId: string, assignmentId: string): Promise<Assignment> {
    const assignment = await this.loadOwned(userId, assignmentId);
    if (assignment.status !== 'ACCEPTED') {
      throw new DomainError(
        'INVALID_STATE_TRANSITION',
        `Assignment is not accepted (status ${assignment.status})`,
        'CONFLICT',
      );
    }
    return assignment;
  }
}
