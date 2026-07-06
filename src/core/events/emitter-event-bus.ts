import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvent } from '../../shared/domain/domain-event';
import { EventBus } from '../../shared/domain/ports/event-bus';

/**
 * Bus in-process (MVP). Los handlers (@OnEvent) viven en notifications/audit.
 * Evolución futura: patrón Outbox + broker sin cambiar el contrato EventBus.
 */
@Injectable()
export class EmitterEventBus implements EventBus {
  constructor(private readonly emitter: EventEmitter2) {}

  async publishAll(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.emitter.emitAsync(event.name, event);
    }
  }
}
