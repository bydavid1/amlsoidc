/**
 * Puerto INVERTIDO (DIP): orders lo define, matching lo implementa
 * (docs/design/02-arquitectura.md). Al cancelar una Order con asignación
 * activa, matching cancela el Assignment y libera la capacidad del Trip
 * dentro de la MISMA transacción.
 */
export const ORDER_ASSIGNMENTS_PORT = Symbol('ORDER_ASSIGNMENTS_PORT');

export interface OrderAssignmentsPort {
  cancelActiveAssignmentForOrder(orderId: string): Promise<void>;
}
