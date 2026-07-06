import { DomainEvent } from './domain-event';

/**
 * Raíz de agregado: acumula eventos de dominio que la capa application
 * publica tras persistir (nunca antes del commit).
 */
export abstract class AggregateRoot {
  private domainEvents: DomainEvent[] = [];

  protected record(event: DomainEvent): void {
    this.domainEvents.push(event);
  }

  pullDomainEvents(): DomainEvent[] {
    const events = [...this.domainEvents];
    this.domainEvents = [];
    return events;
  }
}
