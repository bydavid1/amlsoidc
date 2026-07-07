import { Inject, Injectable } from '@nestjs/common';
import {
  ASSIGNMENT_REPOSITORY,
  AssignmentRepository,
} from '../domain/repositories/assignment.repository';

/**
 * Lecturas publicadas de matching para otros módulos (reputation, incidents):
 * quién es el Traveler efectivamente asignado a un pedido.
 */
@Injectable()
export class MatchingReadService {
  constructor(
    @Inject(ASSIGNMENT_REPOSITORY) private readonly assignments: AssignmentRepository,
  ) {}

  async getAcceptedTravelerProfileId(orderId: string): Promise<string | null> {
    const active = await this.assignments.findActiveByOrder(orderId);
    return active?.status === 'ACCEPTED' ? active.travelerProfileId : null;
  }
}
