import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Único PrismaClient del proceso, por COMPOSICIÓN (no herencia: el constructor
 * de PrismaClient devuelve un Proxy que rompe la cadena de prototipos de una
 * subclase). Los repositorios acceden SIEMPRE vía `prisma.client`, que devuelve
 * la transacción ambiente (AsyncLocalStorage) si existe — así la UnitOfWork
 * enlista a todos los módulos en un commit atómico sin que el dominio sepa de
 * Prisma (docs/design/02-arquitectura.md).
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly base = new PrismaClient();
  private readonly transactionContext = new AsyncLocalStorage<Prisma.TransactionClient>();

  get client(): Prisma.TransactionClient {
    return this.transactionContext.getStore() ?? this.base;
  }

  get inTransaction(): boolean {
    return this.transactionContext.getStore() !== undefined;
  }

  runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    // re-entrante: si ya hay transacción ambiente, se reutiliza
    if (this.inTransaction) {
      return work();
    }
    return this.base.$transaction((tx) => this.transactionContext.run(tx, work));
  }

  async onModuleInit(): Promise<void> {
    await this.base.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.base.$disconnect();
  }
}
