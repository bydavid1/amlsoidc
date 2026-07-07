export const DISPUTE_REPOSITORY = Symbol('DISPUTE_REPOSITORY');

export type DisputeStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'REJECTED';

export interface DisputeRecord {
  id: string;
  orderId: string;
  status: DisputeStatus;
  reason: string;
  createdAt: Date;
}

export interface DisputeRepository {
  create(dispute: { id: string; orderId: string; reason: string }): Promise<DisputeRecord>;
  findById(id: string): Promise<DisputeRecord | null>;
  findByOrderId(orderId: string): Promise<DisputeRecord | null>;
  updateStatus(id: string, status: DisputeStatus): Promise<void>;
  list(status: DisputeStatus | undefined, limit: number): Promise<DisputeRecord[]>;
}
