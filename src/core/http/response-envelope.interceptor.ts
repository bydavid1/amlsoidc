import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { PaginatedResult } from '../../shared/http/paginated-result';

interface RequestWithId {
  id?: string;
}

/**
 * Envelope estándar de éxito (docs/design/04-api.md §2):
 * { success: true, data, meta: { requestId, ...paginación } }
 * Los controllers devuelven datos crudos; el envelope se arma aquí, una sola vez.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithId>();
    const requestId = request.id;

    return next.handle().pipe(
      map((data: unknown) => {
        if (data instanceof PaginatedResult) {
          return {
            success: true,
            data: data.items,
            meta: { requestId, ...data.pagination },
          };
        }
        return { success: true, data: data ?? null, meta: { requestId } };
      }),
    );
  }
}
