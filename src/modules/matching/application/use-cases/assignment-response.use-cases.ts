import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../../../shared/domain/domain-error';
import { OrdersCoordinationService } from '../../../orders/application/orders-coordination.service';
import {
  TRAVELER_PROFILE_REPOSITORY,
  TravelerProfileRepository,
} from '../../../trips/domain/repositories/traveler-profile.repository';
import { Assignment } from '../../domain/entities/assignment.entity';
import {
  ASSIGNMENT_REPOSITORY,
  AssignmentRepository,
  AssignmentListRow,
} from '../../domain/repositories/assignment.repository';

/**
 * Acciones del Traveler sobre sus encargos reclamados: reporta el avance
 * físico del paquete. Las transiciones las valida el agregado Order.
 */
@Injectable()
export class AssignmentResponseService {
  constructor(
    @Inject(ASSIGNMENT_REPOSITORY) private readonly assignments: AssignmentRepository,
    @Inject(TRAVELER_PROFILE_REPOSITORY) private readonly profiles: TravelerProfileRepository,
    private readonly ordersCoordination: OrdersCoordinationService,
  ) {}

  async markReceived(userId: string, assignmentId: string): Promise<void> {
    const a = await this.loadOwnedAccepted(userId, assignmentId);
    await this.ordersCoordination.markReceivedByTraveler(a.orderId, `traveler:${userId}`);
  }

  async markInTransit(userId: string, assignmentId: string): Promise<void> {
    const a = await this.loadOwnedAccepted(userId, assignmentId);
    await this.ordersCoordination.markInTransit(a.orderId, `traveler:${userId}`);
  }

  /** Modelo hub: el traveler registra su dirección de recepción en origen. */
  async setReceivingAddress(
    userId: string,
    assignmentId: string,
    addressLine: string,
  ): Promise<void> {
    const a = await this.loadOwnedAccepted(userId, assignmentId);
    await this.ordersCoordination.setReceivingAddress(a.orderId, addressLine);
  }

  async listMine(userId: string, limit: number): Promise<AssignmentListRow[]> {
    const profile = await this.profiles.findByUserId(userId);
    if (!profile) {
      return [];
    }
    return this.assignments.listByTraveler(profile.id, limit);
  }

  private async loadOwnedAccepted(userId: string, assignmentId: string): Promise<Assignment> {
    const assignment = await this.assignments.findById(assignmentId);
    const profile = await this.profiles.findByUserId(userId);
    // 404 también si no es el destinatario (no revelar recursos ajenos)
    if (!assignment || !profile || assignment.travelerProfileId !== profile.id) {
      throw new DomainError('NOT_FOUND', 'Assignment not found', 'NOT_FOUND');
    }
    if (assignment.status !== 'ACCEPTED') {
      throw new DomainError(
        'INVALID_STATE_TRANSITION',
        `Assignment is not active (status ${assignment.status})`,
        'CONFLICT',
      );
    }
    return assignment;
  }
}
