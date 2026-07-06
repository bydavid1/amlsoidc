import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Paginación por CURSOR para listados que crecen sin límite con escritura
 * concurrente (Orders, Trips, Assignments) — docs/design/04-api.md §5.
 * Cursor opaco = base64url("<createdAt ISO>|<id>").
 */
export class CursorPaginationDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ description: 'Cursor opaco devuelto en meta.nextCursor' })
  @IsOptional()
  @IsString()
  cursor?: string;
}

export interface CursorRef {
  createdAt: Date;
  id: string;
}

export function encodeCursor(ref: CursorRef): string {
  return Buffer.from(`${ref.createdAt.toISOString()}|${ref.id}`).toString('base64url');
}

export function decodeCursor(cursor: string): CursorRef | null {
  try {
    const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    const createdAt = new Date(iso);
    if (!id || Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

/** El envelope interceptor lo detecta y expone meta.nextCursor. */
export class CursorPage<T> {
  private constructor(
    readonly items: T[],
    readonly nextCursor: string | null,
  ) {}

  static of<T extends { createdAt: Date; id: string }>(rows: T[], limit: number): CursorPage<T> {
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    return new CursorPage(items, hasMore && last ? encodeCursor(last) : null);
  }
}
