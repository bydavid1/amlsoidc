/**
 * Puerto INVERTIDO (DIP): trips lo define, matching lo implementa
 * (docs/design/02-arquitectura.md — cancelaciones sin ciclo de dependencia).
 * Al cancelar un Trip, matching cancela sus assignments activos, libera el
 * estado de las Orders afectadas y devuelve sus ids para re-matchear.
 */
export const TRIP_ASSIGNMENTS_PORT = Symbol('TRIP_ASSIGNMENTS_PORT');

export interface TripAssignmentsPort {
  cancelAssignmentsForTrip(tripId: string): Promise<string[]>;
}
