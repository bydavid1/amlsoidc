import { Assignment } from '../entities/assignment.entity';

export const ASSIGNMENT_REPOSITORY = Symbol('ASSIGNMENT_REPOSITORY');

export interface AssignmentListRow {
  id: string;
  orderId: string;
  tripId: string;
  status: string;
  offeredAt: Date;
  expiresAt: Date;
  createdAt: Date;
}

export interface AssignmentRepository {
  findById(id: string): Promise<Assignment | null>;
  save(assignment: Assignment): Promise<void>;
  findActiveByOrder(orderId: string): Promise<Assignment | null>;
  findActiveByTrip(tripId: string): Promise<Assignment[]>;
  countForOrder(orderId: string): Promise<number>;
  /** Travelers que ya recibieron una oferta de este pedido (filtro H8: no re-ofrecer). */
  travelerProfileIdsForOrder(orderId: string): Promise<string[]>;
  countActiveByTraveler(travelerProfileIds: string[]): Promise<Map<string, number>>;
  listByTraveler(travelerProfileId: string, limit: number): Promise<AssignmentListRow[]>;
  findExpiredOffers(now: Date, limit: number): Promise<Assignment[]>;
}
