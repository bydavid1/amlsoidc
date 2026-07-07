import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../../../shared/domain/domain-error';
import { ID_GENERATOR, IdGenerator } from '../../../../shared/domain/ports/id-generator';
import { UNIT_OF_WORK, UnitOfWork } from '../../../../shared/domain/ports/unit-of-work';
import { MatchingReadService } from '../../../matching/application/matching-read.service';
import { OrdersCoordinationService } from '../../../orders/application/orders-coordination.service';
import { TripsCoordinationService } from '../../../trips/application/trips-coordination.service';
import {
  DISPUTE_REPOSITORY,
  DisputeRecord,
  DisputeRepository,
  DisputeStatus,
} from '../../domain/repositories/dispute.repository';

@Injectable()
export class ReportIssueUseCase {
  constructor(
    @Inject(DISPUTE_REPOSITORY) private readonly disputes: DisputeRepository,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    private readonly ordersCoordination: OrdersCoordinationService,
    private readonly tripsCoordination: TripsCoordinationService,
    private readonly matchingRead: MatchingReadService,
  ) {}

  /** Buyer o Traveler asignado abren una disputa: Order → DISPUTED + Dispute OPEN. */
  async execute(userId: string, orderId: string, reason: string): Promise<DisputeRecord> {
    const order = await this.ordersCoordination.getMatchableOrder(orderId);
    if (!order) {
      throw new DomainError('NOT_FOUND', 'Order not found', 'NOT_FOUND');
    }

    const travelerProfileId = await this.matchingRead.getAcceptedTravelerProfileId(orderId);
    const travelerUserId = travelerProfileId
      ? await this.tripsCoordination.getTravelerUserId(travelerProfileId)
      : null;
    const isParticipant = userId === order.buyerUserId || userId === travelerUserId;
    if (!isParticipant) {
      throw new DomainError('NOT_FOUND', 'Order not found', 'NOT_FOUND');
    }

    if (await this.disputes.findByOrderId(orderId)) {
      throw new DomainError('DISPUTE_ALREADY_OPEN', 'Order already has a dispute', 'CONFLICT');
    }

    return this.uow.execute(async () => {
      // el agregado valida desde qué estados se puede disputar
      await this.ordersCoordination.disputeOrder(orderId, `user:${userId}`);
      return this.disputes.create({ id: this.ids.next(), orderId, reason });
    });
  }
}

export type DisputeResolution = 'RESOLVED' | 'REJECTED';
export type DisputeOrderOutcome = 'CANCEL_ORDER' | 'RESUME_ORDER';

@Injectable()
export class ResolveDisputeUseCase {
  constructor(
    @Inject(DISPUTE_REPOSITORY) private readonly disputes: DisputeRepository,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    private readonly ordersCoordination: OrdersCoordinationService,
  ) {}

  /** Solo Admin (guard en el controller): cierra la disputa y decide el destino del pedido. */
  async execute(
    adminUserId: string,
    disputeId: string,
    resolution: DisputeResolution,
    orderOutcome: DisputeOrderOutcome,
  ): Promise<DisputeRecord> {
    const dispute = await this.disputes.findById(disputeId);
    if (!dispute) {
      throw new DomainError('NOT_FOUND', 'Dispute not found', 'NOT_FOUND');
    }
    if (dispute.status === 'RESOLVED' || dispute.status === 'REJECTED') {
      throw new DomainError('DISPUTE_ALREADY_CLOSED', 'Dispute is already closed', 'CONFLICT');
    }

    await this.uow.execute(async () => {
      await this.disputes.updateStatus(disputeId, resolution);
      const actor = `admin:${adminUserId}`;
      if (orderOutcome === 'CANCEL_ORDER') {
        await this.ordersCoordination.cancelFromDispute(dispute.orderId, actor);
      } else {
        // retoma el estado previo a DISPUTED, leído del historial
        await this.ordersCoordination.resumeFromDispute(dispute.orderId, actor);
      }
    });

    return { ...dispute, status: resolution };
  }
}

@Injectable()
export class ListDisputesUseCase {
  constructor(@Inject(DISPUTE_REPOSITORY) private readonly disputes: DisputeRepository) {}

  execute(status: DisputeStatus | undefined, limit: number): Promise<DisputeRecord[]> {
    return this.disputes.list(status, limit);
  }
}
