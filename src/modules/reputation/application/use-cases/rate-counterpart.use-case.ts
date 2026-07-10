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

export interface RateExperienceCommand {
  userId: string;
  orderId: string;
  score: number;
  comment: string | null;
}

/**
 * MODELO HUB: solo el BUYER califica (su experiencia con la entrega); la
 * calificación alimenta internamente la reputación del traveler y COMPLETA
 * el pedido. El buyer nunca conoce al traveler, así que no hay calificación
 * mutua (el operador de Bringo puntúa al traveler al recibir en el hub).
 */
@Injectable()
export class RateExperienceUseCase {
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

  async execute(command: RateExperienceCommand): Promise<{ completed: boolean }> {
    if (!Number.isInteger(command.score) || command.score < 1 || command.score > 5) {
      throw new DomainError('RATING_SCORE_INVALID', 'Score must be 1..5', 'UNPROCESSABLE');
    }

    const order = await this.ordersCoordination.getMatchableOrder(command.orderId);
    // 404 también si no es el buyer: no revelar pedidos ajenos
    if (!order || order.buyerUserId !== command.userId) {
      throw new DomainError('NOT_FOUND', 'Order not found', 'NOT_FOUND');
    }
    if (order.status !== 'DELIVERED') {
      throw new DomainError(
        'ORDER_NOT_RATEABLE',
        `Ratings are only allowed after delivery (status ${order.status})`,
        'CONFLICT',
      );
    }

    const travelerUserId = await this.resolveTravelerUserId(command.orderId);
    if (!travelerUserId) {
      throw new DomainError('ORDER_NOT_RATEABLE', 'Order has no assigned traveler', 'CONFLICT');
    }

    if (await this.ratings.existsByOrderAndRater(command.orderId, command.userId)) {
      throw new DomainError('ALREADY_RATED', 'You already rated this order', 'CONFLICT');
    }

    const now = this.clock.now();
    await this.uow.execute(async () => {
      await this.ratings.create({
        id: this.ids.next(),
        orderId: command.orderId,
        raterUserId: command.userId,
        rateeUserId: travelerUserId,
        score: command.score,
        comment: command.comment,
      });
      // la calificación del buyer cierra el ciclo del pedido
      await this.ordersCoordination.completeOrder(command.orderId, 'system:buyer-rated');
    });

    await this.publishReputationEvents(command, travelerUserId, now);
    return { completed: true };
  }

  private async resolveTravelerUserId(orderId: string): Promise<string | null> {
    const profileId = await this.matchingRead.getAcceptedTravelerProfileId(orderId);
    return profileId ? this.tripsCoordination.getTravelerUserId(profileId) : null;
  }

  private async publishReputationEvents(
    command: RateExperienceCommand,
    travelerUserId: string,
    now: Date,
  ): Promise<void> {
    const aggregate = await this.ratings.aggregateForRatee(travelerUserId);
    await this.eventBus.publishAll([
      new RatingCreatedEvent(now, {
        orderId: command.orderId,
        raterUserId: command.userId,
        rateeUserId: travelerUserId,
        score: command.score,
      }),
      new ReputationUpdatedEvent(now, {
        userId: travelerUserId,
        average: aggregate.average,
        count: aggregate.count,
      }),
    ]);
  }
}

export interface RateTravelerByOperatorCommand {
  adminUserId: string;
  orderId: string;
  score: number;
  note: string | null;
}

/**
 * El operador de Bringo puntúa al traveler al confirmar la recepción en el
 * hub (puntualidad, estado del paquete). Alimenta la misma reputación; NO
 * completa el pedido.
 */
@Injectable()
export class RateTravelerByOperatorUseCase {
  constructor(
    @Inject(RATING_REPOSITORY) private readonly ratings: RatingRepository,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly tripsCoordination: TripsCoordinationService,
    private readonly matchingRead: MatchingReadService,
  ) {}

  async execute(command: RateTravelerByOperatorCommand): Promise<void> {
    if (!Number.isInteger(command.score) || command.score < 1 || command.score > 5) {
      throw new DomainError('RATING_SCORE_INVALID', 'Score must be 1..5', 'UNPROCESSABLE');
    }
    const profileId = await this.matchingRead.getAcceptedTravelerProfileId(command.orderId);
    const travelerUserId = profileId
      ? await this.tripsCoordination.getTravelerUserId(profileId)
      : null;
    if (!travelerUserId) {
      throw new DomainError('ORDER_NOT_RATEABLE', 'Order has no assigned traveler', 'CONFLICT');
    }
    if (await this.ratings.existsByOrderAndRater(command.orderId, command.adminUserId)) {
      return; // idempotente: el operador ya puntuó este encargo
    }

    const now = this.clock.now();
    await this.ratings.create({
      id: this.ids.next(),
      orderId: command.orderId,
      raterUserId: command.adminUserId,
      rateeUserId: travelerUserId,
      score: command.score,
      comment: command.note,
    });
    const aggregate = await this.ratings.aggregateForRatee(travelerUserId);
    await this.eventBus.publishAll([
      new ReputationUpdatedEvent(now, {
        userId: travelerUserId,
        average: aggregate.average,
        count: aggregate.count,
      }),
    ]);
  }
}
