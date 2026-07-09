import { CursorRef } from '../../../../shared/http/cursor-pagination';
import { Order, OrderStatus } from '../entities/order.entity';

export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');

export interface OrderListRow {
  id: string;
  productName: string;
  originCountryId: string;
  destinationCountryId: string;
  status: OrderStatus;
  fulfillmentStatus: string | null;
  sizeCategory: string;
  estimatedTotalAmount: number;
  createdAt: Date;
}

export interface StatusHistoryRow {
  fromState: string | null;
  toState: string;
  actor: string | null;
  occurredAt: Date;
}

export interface OrderRepository {
  findById(id: string): Promise<Order | null>;
  /** Persiste el agregado Y su historial de transiciones en la misma transacción. */
  save(order: Order): Promise<void>;
  listByBuyer(
    buyerProfileId: string,
    limit: number,
    cursor: CursorRef | null,
    status?: OrderStatus,
  ): Promise<OrderListRow[]>;
  getStatusHistory(orderId: string): Promise<StatusHistoryRow[]>;
  countAssignmentsForOrder?(orderId: string): Promise<number>;
}
