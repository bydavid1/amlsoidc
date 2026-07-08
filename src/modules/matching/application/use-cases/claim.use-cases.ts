import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../../../shared/domain/domain-error';
import { Clock, CLOCK } from '../../../../shared/domain/ports/clock';
import { EVENT_BUS, EventBus } from '../../../../shared/domain/ports/event-bus';
import { ID_GENERATOR, IdGenerator } from '../../../../shared/domain/ports/id-generator';
import { UNIT_OF_WORK, UnitOfWork } from '../../../../shared/domain/ports/unit-of-work';
import {
  MatchableOrderView,
  OrdersCoordinationService,
} from '../../../orders/application/orders-coordination.service';
import {
  ClaimableTripView,
  TripsCoordinationService,
} from '../../../trips/application/trips-coordination.service';
import {
  TRAVELER_PROFILE_REPOSITORY,
  TravelerProfileRepository,
} from '../../../trips/domain/repositories/traveler-profile.repository';
import { Assignment } from '../../domain/entities/assignment.entity';
import {
  ASSIGNMENT_REPOSITORY,
  AssignmentRepository,
} from '../../domain/repositories/assignment.repository';

const DISCOVERY_LIMIT = 50;

/**
 * Modelo DISCOVERY + CLAIM (docs/design/09-modelo-claim-y-pricing.md):
 * el Traveler explora los encargos compatibles con su viaje y reclama los
 * que decide llevar. El Buyer sigue sin elegir viajero.
 */
@Injectable()
export class ClaimService {
  constructor(
    @Inject(ASSIGNMENT_REPOSITORY) private readonly assignments: AssignmentRepository,
    @Inject(TRAVELER_PROFILE_REPOSITORY) private readonly profiles: TravelerProfileRepository,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ordersCoordination: OrdersCoordinationService,
    private readonly tripsCoordination: TripsCoordinationService,
  ) {}

  /** Encargos PENDING del corredor del viaje, compatibles en fecha, sin los propios. */
  async listAvailableOrders(userId: string, tripId: string): Promise<MatchableOrderView[]> {
    const trip = await this.loadOwnedOpenTrip(userId, tripId);
    const pending = await this.ordersCoordination.listPendingByCorridor(
      trip.originCountryId,
      trip.destinationCountryId,
      DISCOVERY_LIMIT,
    );
    return pending.filter(
      (order) =>
        order.buyerUserId !== userId && // nadie se lleva sus propios pedidos
        (order.neededBy === null || trip.arrivalDate.getTime() <= order.neededBy.getTime()),
    );
  }

  /** Claim atómico: Assignment(ACCEPTED) + Order → ASSIGNED en una transacción. */
  async claim(userId: string, tripId: string, orderId: string): Promise<Assignment> {
    const trip = await this.loadOwnedOpenTrip(userId, tripId);

    const order = await this.ordersCoordination.getMatchableOrder(orderId);
    if (!order || order.status !== 'PENDING_ASSIGNMENT') {
      throw new DomainError(
        'ORDER_ALREADY_TAKEN',
        'This order is no longer available',
        'CONFLICT',
      );
    }
    if (order.buyerUserId === userId) {
      throw new DomainError('NOT_FOUND', 'Order not found', 'NOT_FOUND');
    }
    if (
      order.originCountryId !== trip.originCountryId ||
      order.destinationCountryId !== trip.destinationCountryId
    ) {
      throw new DomainError(
        'ORDER_NOT_COMPATIBLE',
        'Order corridor does not match this trip',
        'CONFLICT',
      );
    }
    if (order.neededBy && trip.arrivalDate.getTime() > order.neededBy.getTime()) {
      throw new DomainError(
        'ORDER_NOT_COMPATIBLE',
        'Trip arrives after the date the buyer needs the product',
        'CONFLICT',
      );
    }

    const assignment = await this.uow.execute(async () => {
      const created = Assignment.claim({
        id: this.ids.next(),
        orderId,
        tripId,
        travelerProfileId: trip.travelerProfileId,
        now: this.clock.now(),
      });
      // si otro traveler ganó la carrera, el índice único lanza ORDER_ALREADY_TAKEN
      await this.assignments.save(created);
      await this.ordersCoordination.markAssigned(orderId, `traveler:${userId}`);
      return created;
    });

    await this.eventBus.publishAll(assignment.pullDomainEvents());
    return assignment;
  }

  private async loadOwnedOpenTrip(userId: string, tripId: string): Promise<ClaimableTripView> {
    const trip = await this.tripsCoordination.getClaimableTrip(tripId);
    const profile = await this.profiles.findByUserId(userId);
    // 404 también si no es el dueño: no revelar viajes ajenos
    if (!trip || !profile || trip.travelerProfileId !== profile.id) {
      throw new DomainError('NOT_FOUND', 'Trip not found', 'NOT_FOUND');
    }
    if (trip.status !== 'OPEN') {
      throw new DomainError(
        'TRIP_NOT_OPEN',
        `Trip must be published to claim orders (status ${trip.status})`,
        'CONFLICT',
      );
    }
    return trip;
  }
}
