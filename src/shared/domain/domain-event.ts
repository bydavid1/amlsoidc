/**
 * Evento de dominio: cada transición de estado relevante emite uno.
 * Sirven para notificaciones, auditoría e integraciones futuras sin acoplar módulos.
 */
export interface DomainEvent {
  readonly name: string;
  readonly occurredAt: Date;
  readonly payload: Record<string, unknown>;
}
