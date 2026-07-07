import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../../../shared/domain/domain-error';
import { Clock, CLOCK } from '../../../../shared/domain/ports/clock';
import { EVENT_BUS, EventBus } from '../../../../shared/domain/ports/event-bus';
import { ID_GENERATOR, IdGenerator } from '../../../../shared/domain/ports/id-generator';
import { UNIT_OF_WORK, UnitOfWork } from '../../../../shared/domain/ports/unit-of-work';
import { MatchingReadService } from '../../../matching/application/matching-read.service';
import { OrdersCoordinationService } from '../../../orders/application/orders-coordination.service';
import { TripsCoordinationService } from '../../../trips/application/trips-coordination.service';
import { RatingCreatedEvent, ReputationUpdatedEvent } from '../../domain/events/rating.events';
import {
  RATING_REPOSITORY,
  RatingRepository,
} from '../../domain/repositories/rating.repository';

export interface RateCounterpartCommand {
  userId: string;
  orderId: string;
  score: number;
  comment: string | null;
}

/**
 * Calificación mutua tras DELIVERED (docs/design/01-dominio.md): cuando ambas
 * partes califican, el pedido pasa a COMPLETED. Si el calificado es el
 * Traveler, se recalcula su reputación y se publica el snapshot (el matching
 * lo consume vía el cache en TravelerProfile).
 */
@Injectable()
export class RateCounterpartUseCase {
  constructor(
    @Inject(RATING_REPOSITORY) private readonly ratings: RatingRepository,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ordersCoordination: OrdersCoordinationService,
    private readonly tripsCoordination: TripsCoordinationService,
    private readonly matchingRead: MatchingReadService,
  ) {}

  async execute(command: RateCounterpartCommand): Promise<{ completed: boolean }> {
    if (!Number.isInteger(command.score) || command.score < 1 || command.score > 5) {
      throw new DomainError('RATING_SCORE_INVALID', 'Score must be 1..5', 'UNPROCESSABLE');
    }

    const order = await this.ordersCoordination.getMatchableOrder(command.orderId);
    if (!order) {
      throw new DomainError('NOT_FOUND', 'Order not found', 'NOT_FOUND');
    }
    if (order.status !== 'DELIVERED') {
      throw new DomainError(
        'ORDER_NOT_RATEABLE',
        `Ratings are only allowed after delivery (status ${order.status})`,
        'CONFLICT',
      );
    }

    // participantes: Buyer del pedido y Traveler del assignment aceptado
    const travelerProfileId = await this.matchingRead.getAcceptedTravelerProfileId(
      command.orderId,
    );
    const travelerUserId = travelerProfileId
      ? await this.tripsCoordination.getTravelerUserId(travelerProfileId)
      : null;
    if (!travelerUserId) {
      throw new DomainError('ORDER_NOT_RATEABLE', 'Order has no accepted traveler', 'CONFLICT');
    }

    let rateeUserId: string;
    if (command.userId === order.buyerUserId) {
      rateeUserId = travelerUserId;
    } else if (command.userId === travelerUserId) {
      rateeUserId = order.buyerUserId;
    } else {
      // 404: no revelar la existencia de pedidos ajenos
      throw new DomainError('NOT_FOUND', 'Order not found', 'NOT_FOUND');
    }

    if (await this.ratings.existsByOrderAndRater(command.orderId, command.userId)) {
      throw new DomainError('ALREADY_RATED', 'You already rated this order', 'CONFLICT');
    }

    const now = this.clock.now();
    const completed = await this.uow.execute(async () => {
      await this.ratings.create({
        id: this.ids.next(),
        orderId: command.orderId,
        raterUserId: command.userId,
        rateeUserId,
        score: command.score,
        comment: command.comment,
      });
      const count = await this.ratings.countForOrder(command.orderId);
      if (count >= 2) {
        await this.ordersCoordination.completeOrder(command.orderId, 'system:both-rated');
        return true;
      }
      return false;
    });

    const events: (RatingCreatedEvent | ReputationUpdatedEvent)[] = [
      new RatingCreatedEvent(now, {
        orderId: command.orderId,
        raterUserId: command.userId,
        rateeUserId,
        score: command.score,
      }),
    ];

    // el snapshot de reputación solo aplica al Traveler (influye en el matching)
    if (rateeUserId === travelerUserId) {
      const aggregate = await this.ratings.aggregateForRatee(rateeUserId);
      events.push(
        new ReputationUpdatedEvent(now, {
          userId: rateeUserId,
          average: aggregate.average,
          count: aggregate.count,
        }),
      );
    }
    await this.eventBus.publishAll(events);

    return { completed };
  }
}
