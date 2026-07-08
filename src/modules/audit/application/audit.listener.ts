import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import {
  AssignmentAcceptedEvent,
  AssignmentCancelledEvent,
} from '../../matching/domain/events/assignment.events';
import { OrderStatusChangedEvent } from '../../orders/domain/events/order.events';

/** Extrae el userId de actores con forma 'buyer:<id>' / 'traveler:<id>' / 'admin:<id>'. */
function actorUserId(actor: string | undefined): string | null {
  if (!actor) return null;
  const [, id] = actor.split(':');
  return id && id.length > 10 ? id : null;
}

/**
 * Audit trail INMUTABLE de negocio (append-only), distinto del logging técnico
 * de core (docs/design/02-arquitectura.md): toda transición de estado del
 * pedido y todo movimiento del assignment quedan registrados.
 */
@Injectable()
export class AuditListener {
  private readonly logger = new Logger(AuditListener.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(OrderStatusChangedEvent.EVENT_NAME, { promisify: true })
  async onOrderStatusChanged(event: OrderStatusChangedEvent): Promise<void> {
    await this.append({
      actorUserId: actorUserId(event.payload.actor),
      action: 'ORDER_STATUS_CHANGED',
      entity: 'Order',
      entityId: event.payload.orderId,
      metadata: { from: event.payload.from, to: event.payload.to, actor: event.payload.actor },
    });
  }

  @OnEvent(AssignmentAcceptedEvent.EVENT_NAME, { promisify: true })
  onAccepted(event: AssignmentAcceptedEvent): Promise<void> {
    return this.assignmentEvent('ASSIGNMENT_CLAIMED', event.payload);
  }

  @OnEvent(AssignmentCancelledEvent.EVENT_NAME, { promisify: true })
  onCancelled(event: AssignmentCancelledEvent): Promise<void> {
    return this.assignmentEvent('ASSIGNMENT_CANCELLED', event.payload);
  }

  private assignmentEvent(
    action: string,
    payload: { assignmentId: string; orderId: string; tripId: string },
  ): Promise<void> {
    return this.append({
      actorUserId: null,
      action,
      entity: 'Assignment',
      entityId: payload.assignmentId,
      metadata: { orderId: payload.orderId, tripId: payload.tripId },
    });
  }

  private async append(entry: {
    actorUserId: string | null;
    action: string;
    entity: string;
    entityId: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.prisma.client.auditLog.create({
        data: { ...entry, metadata: entry.metadata as Prisma.InputJsonValue },
      });
    } catch (error) {
      this.logger.warn({ err: (error as Error).message }, 'Audit write failed');
    }
  }
}
