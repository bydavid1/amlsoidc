export interface OffsetPaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/**
 * Resultado paginado por offset (catálogos pequeños y estables).
 * El envelope interceptor lo detecta y funde `pagination` dentro de `meta`.
 */
export class PaginatedResult<T> {
  private constructor(
    readonly items: T[],
    readonly pagination: OffsetPaginationMeta,
  ) {}

  static of<T>(items: T[], totalItems: number, page: number, pageSize: number): PaginatedResult<T> {
    return new PaginatedResult(items, {
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    });
  }
}
