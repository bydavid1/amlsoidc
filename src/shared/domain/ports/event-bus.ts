import { DomainEvent } from '../domain-event';

export const EVENT_BUS = Symbol('EVENT_BUS');

/**
 * Bus de eventos de dominio in-process (MVP). La evolución a outbox+broker
 * cambia la implementación, no este contrato.
 */
export interface EventBus {
  publishAll(events: DomainEvent[]): Promise<void>;
}
