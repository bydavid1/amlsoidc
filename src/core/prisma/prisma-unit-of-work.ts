import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../shared/domain/ports/unit-of-work';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaUnitOfWork implements UnitOfWork {
  constructor(private readonly prisma: PrismaService) {}

  execute<T>(work: () => Promise<T>): Promise<T> {
    return this.prisma.runInTransaction(work);
  }
}
