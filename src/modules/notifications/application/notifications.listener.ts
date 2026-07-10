import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AssignmentAcceptedEvent } from '../../matching/domain/events/assignment.events';
import { MatchingReadService } from '../../matching/application/matching-read.service';
import { OrderStatusChangedEvent } from '../../orders/domain/events/order.events';
import { OrdersCoordinationService } from '../../orders/application/orders-coordination.service';
import { NotificationsService } from './notifications.service';

/** Estados del pedido que ameritan avisar al Buyer. */
const BUYER_RELEVANT = new Set([
  'ASSIGNED',
  'IN_TRANSIT',
  'READY_FOR_DELIVERY',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'DISPUTED',
]);

/**
 * Módulo 100% reactivo: nadie lo llama directamente; escucha eventos de
 * dominio y persiste notificaciones (docs/design/02-arquitectura.md).
 * Nunca lanza: perder una notificación no puede romper una transacción de negocio.
 */
@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly ordersCoordination: OrdersCoordinationService,
    private readonly matchingRead: MatchingReadService,
  ) {}

  /** Un viajero reclamó el encargo → avisar al Buyer con NOMBRE (narrativa Uber). */
  @OnEvent(AssignmentAcceptedEvent.EVENT_NAME, { promisify: true })
  async onAccepted(event: AssignmentAcceptedEvent): Promise<void> {
    await this.safely(async () => {
      const order = await this.ordersCoordination.getMatchableOrder(event.payload.orderId);
      if (order) {
        const traveler = await this.matchingRead.getAssignedTravelerPublicInfo(
          event.payload.orderId,
        );
        await this.notifications.notify(order.buyerUserId, 'TRAVELER_ASSIGNED', {
          orderId: event.payload.orderId,
          travelerFirstName: traveler?.firstName ?? null,
        });
      }
    });
  }

  @OnEvent(OrderStatusChangedEvent.EVENT_NAME, { promisify: true })
  async onOrderStatusChanged(event: OrderStatusChangedEvent): Promise<void> {
    if (!BUYER_RELEVANT.has(event.payload.to)) {
      return;
    }
    await this.safely(async () => {
      const order = await this.ordersCoordination.getMatchableOrder(event.payload.orderId);
      if (order) {
        // el relato mantiene al viajero como protagonista ("Carlos va en camino")
        const traveler = await this.matchingRead.getAssignedTravelerPublicInfo(
          event.payload.orderId,
        );
        await this.notifications.notify(order.buyerUserId, 'ORDER_STATUS_CHANGED', {
          orderId: event.payload.orderId,
          from: event.payload.from,
          to: event.payload.to,
          travelerFirstName: traveler?.firstName ?? null,
        });
      }
    });
  }

  private async safely(work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.logger.warn({ err: (error as Error).message }, 'Notification handler failed');
    }
  }
}
