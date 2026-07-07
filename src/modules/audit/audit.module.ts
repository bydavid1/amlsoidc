import { Module } from '@nestjs/common';
import { AuditListener } from './application/audit.listener';

/** Módulo con estado (audit trail en DB), alimentado SOLO por eventos. */
@Module({
  providers: [AuditListener],
})
export class AuditModule {}
