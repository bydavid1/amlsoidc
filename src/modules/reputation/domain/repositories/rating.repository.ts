export const RATING_REPOSITORY = Symbol('RATING_REPOSITORY');

export interface RatingRecord {
  id: string;
  orderId: string;
  raterUserId: string;
  rateeUserId: string;
  score: number;
  comment: string | null;
}

export interface ReputationAggregate {
  average: number;
  count: number;
}

export interface RatingRepository {
  create(rating: RatingRecord): Promise<void>;
  existsByOrderAndRater(orderId: string, raterUserId: string): Promise<boolean>;
  countForOrder(orderId: string): Promise<number>;
  /** Agregado sobre TODAS las calificaciones recibidas (fuente de verdad de reputación). */
  aggregateForRatee(rateeUserId: string): Promise<ReputationAggregate>;
}
