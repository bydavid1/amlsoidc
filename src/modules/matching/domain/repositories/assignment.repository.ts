import { Assignment } from '../entities/assignment.entity';

export const ASSIGNMENT_REPOSITORY = Symbol('ASSIGNMENT_REPOSITORY');

export interface AssignmentListRow {
  id: string;
  orderId: string;
  tripId: string;
  status: string;
  offeredAt: Date;
  respondedAt: Date | null;
  createdAt: Date;
  // contexto del pedido: el Traveler decide su siguiente acción con esto
  productName: string;
  sizeCategory: string;
  travelerRewardAmount: number;
  destinationCityId: string;
  orderStatus: string;
  fulfillmentStatus: string | null;
  receivingAddressLine: string | null;
  /** Señal de confianza: el buyer ya pagó el servicio a Bringo. */
  servicePaid: boolean;
}

export interface AssignmentRepository {
  findById(id: string): Promise<Assignment | null>;
  /**
   * Persiste el assignment. Si otro claim activo ya existe para la Order,
   * lanza DomainError('ORDER_ALREADY_TAKEN') — el índice único parcial en DB
   * es la fuente de verdad ante la carrera.
   */
  save(assignment: Assignment): Promise<void>;
  findActiveByOrder(orderId: string): Promise<Assignment | null>;
  findActiveByTrip(tripId: string): Promise<Assignment[]>;
  listByTraveler(travelerProfileId: string, limit: number): Promise<AssignmentListRow[]>;
}
