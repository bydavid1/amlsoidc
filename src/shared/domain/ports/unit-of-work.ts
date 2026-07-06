export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');

/**
 * Frontera transaccional compartida y re-entrante (docs/design/02-arquitectura.md).
 * Los repositorios se enlistan solos en la transacción ambiente (AsyncLocalStorage),
 * por lo que un caso de uso puede coordinar varios módulos atómicamente sin
 * exponer Prisma al dominio.
 */
export interface UnitOfWork {
  execute<T>(work: () => Promise<T>): Promise<T>;
}
