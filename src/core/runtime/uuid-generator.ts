import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { IdGenerator } from '../../shared/domain/ports/id-generator';

@Injectable()
export class UuidGenerator implements IdGenerator {
  next(): string {
    return randomUUID();
  }
}
