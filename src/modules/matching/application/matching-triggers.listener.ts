import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OrderCreatedEvent, OrderStatusChangedEvent } from '../../orders/domain/events/order.events';
import { TripPublishedEvent } from '../../trips/domain/events/trip.events';
import { AssignmentCancelledEvent } from '../domain/events/assignment.events';
import { OrdersCoordinationService } from '../../orders/application/orders-coordination.service';
import { RunMatchingForOrderUseCase } from './use-cases/run-matching-for-order.use-case';

const REMATCH_BATCH = 25;

/**
 * Disparadores del matching (docs/design/06-matching.md §5): reacciona a
 * eventos de dominio in-process. Nunca lanza: el matching fallido se
 * reintenta ante el siguiente evento o el barrido periódico.
 */
@Injectable()
export class MatchingTriggersListener {
  private readonly logger = new Logger(MatchingTriggersListener.name);

  constructor(
    private readonly runMatching: RunMatchingForOrderUseCase,
    private readonly ordersCoordination: OrdersCoordinationService,
  ) {}

  @OnEvent(OrderCreatedEvent.EVENT_NAME, { promisify: true })
  async onOrderCreated(event: OrderCreatedEvent): Promise<void> {
    await this.match(event.payload.orderId);
  }

  /** Un viaje nuevo puede desbloquear pedidos pendientes de SU corredor. */
  @OnEvent(TripPublishedEvent.EVENT_NAME, { promisify: true })
  async onTripPublished(event: TripPublishedEvent): Promise<void> {
    const pending = await this.ordersCoordination.listPendingByCorridor(
      event.payload.originCountryId,
      event.payload.destinationCountryId,
      REMATCH_BATCH,
    );
    for (const order of pending) {
      await this.match(order.id);
    }
  }

  /** Assignment cancelado (trip cancelado / cancelación cruzada): re-matchear. */
  @OnEvent(AssignmentCancelledEvent.EVENT_NAME, { promisify: true })
  async onAssignmentCancelled(event: AssignmentCancelledEvent): Promise<void> {
    await this.match(event.payload.orderId);
  }

  /** Una Order que VUELVE a PENDING_ASSIGNMENT necesita nuevo match. */
  @OnEvent(OrderStatusChangedEvent.EVENT_NAME, { promisify: true })
  async onOrderStatusChanged(event: OrderStatusChangedEvent): Promise<void> {
    if (event.payload.to === 'PENDING_ASSIGNMENT' && event.payload.from !== null) {
      await this.match(event.payload.orderId);
    }
  }

  private async match(orderId: string): Promise<void> {
    try {
      await this.runMatching.execute(orderId);
    } catch (error) {
      this.logger.warn({ orderId, err: (error as Error).message }, 'Matching trigger failed');
    }
  }
}
