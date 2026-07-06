import { Inject, Injectable, Logger } from '@nestjs/common';
import { Clock, CLOCK } from '../../../../shared/domain/ports/clock';
import { EVENT_BUS, EventBus } from '../../../../shared/domain/ports/event-bus';
import { OrderAssignmentsPort } from '../../../orders/domain/ports/order-assignments.port';
import { TripAssignmentsPort } from '../../../trips/domain/ports/trip-assignments.port';
import { OrdersCoordinationService } from '../../../orders/application/orders-coordination.service';
import { TripsCoordinationService } from '../../../trips/application/trips-coordination.service';
import {
  ASSIGNMENT_REPOSITORY,
  AssignmentRepository,
} from '../../domain/repositories/assignment.repository';

/**
 * Implementaciones de los puertos INVERTIDOS que orders y trips definen
 * (docs/design/02-arquitectura.md): las flechas de dependencia siguen
 * apuntando matching → {orders, trips}; el binding se hace por DI.
 * Estos métodos se invocan DENTRO de la UoW del caso de uso llamador,
 * por lo que se enlistan en su misma transacción.
 */
@Injectable()
export class MatchingOrderAssignmentsAdapter implements OrderAssignmentsPort {
  constructor(
    @Inject(ASSIGNMENT_REPOSITORY) private readonly assignments: AssignmentRepository,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ordersCoordination: OrdersCoordinationService,
    private readonly tripsCoordination: TripsCoordinationService,
  ) {}

  /** CancelOrder: cancela el assignment activo y devuelve la capacidad al Trip. */
  async cancelActiveAssignmentForOrder(orderId: string): Promise<void> {
    const assignment = await this.assignments.findActiveByOrder(orderId);
    if (!assignment) {
      return;
    }
    assignment.cancel(this.clock.now());
    await this.assignments.save(assignment);
    const order = await this.ordersCoordination.getMatchableOrder(orderId);
    await this.tripsCoordination.releaseCapacity(
      assignment.tripId,
      order?.requiredCapacity ?? 1,
    );
    await this.eventBus.publishAll(assignment.pullDomainEvents());
  }
}

@Injectable()
export class MatchingTripAssignmentsAdapter implements TripAssignmentsPort {
  private readonly logger = new Logger(MatchingTripAssignmentsAdapter.name);

  constructor(
    @Inject(ASSIGNMENT_REPOSITORY) private readonly assignments: AssignmentRepository,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ordersCoordination: OrdersCoordinationService,
  ) {}

  /**
   * CancelTrip: cancela los assignments activos del viaje. Las Orders
   * aceptadas vuelven a PENDING_ASSIGNMENT (o DISPUTED si ya se compró);
   * las que solo tenían oferta siguen pendientes. Devuelve las afectadas
   * para re-matchearlas tras el commit.
   */
  async cancelAssignmentsForTrip(tripId: string): Promise<string[]> {
    const active = await this.assignments.findActiveByTrip(tripId);
    const affectedOrderIds: string[] = [];
    const now = this.clock.now();

    for (const assignment of active) {
      const wasAccepted = assignment.status === 'ACCEPTED';
      assignment.cancel(now);
      await this.assignments.save(assignment);
      if (wasAccepted) {
        await this.ordersCoordination.returnToPending(assignment.orderId, 'system:trip-cancelled');
      }
      affectedOrderIds.push(assignment.orderId);
      await this.eventBus.publishAll(assignment.pullDomainEvents());
    }

    if (affectedOrderIds.length > 0) {
      this.logger.log({ tripId, affectedOrderIds }, 'Assignments cancelled with trip');
    }
    return affectedOrderIds;
  }
}
