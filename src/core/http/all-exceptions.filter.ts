import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { DomainError, DomainErrorKind } from '../../shared/domain/domain-error';

const KIND_TO_STATUS: Record<DomainErrorKind, number> = {
  NOT_FOUND: HttpStatus.NOT_FOUND,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  CONFLICT: HttpStatus.CONFLICT,
  UNPROCESSABLE: HttpStatus.UNPROCESSABLE_ENTITY,
};

const STATUS_TO_CODE: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE',
  429: 'RATE_LIMITED',
};

interface ErrorBody {
  code: string;
  message: string;
  details: unknown[];
}

/**
 * Envelope estándar de error (docs/design/04-api.md §2-3). Los 500 nunca
 * exponen detalles internos; todo error lleva requestId para correlación.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ id?: string; url?: string }>();
    const requestId = request.id;

    let status: number;
    let body: ErrorBody;

    if (exception instanceof DomainError) {
      status = KIND_TO_STATUS[exception.kind];
      body = { code: exception.code, message: exception.message, details: [] };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      body = this.fromHttpException(exception, status);
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      body = { code: 'INTERNAL_ERROR', message: 'Internal server error', details: [] };
      const err = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error(
        { requestId, url: request.url, err: err.message },
        err.stack,
      );
    }

    response.status(status).json({
      success: false,
      error: body,
      meta: { requestId },
    });
  }

  private fromHttpException(exception: HttpException, status: number): ErrorBody {
    const raw = exception.getResponse();
    const fallbackCode = STATUS_TO_CODE[status] ?? 'ERROR';

    if (typeof raw === 'string') {
      return { code: fallbackCode, message: raw, details: [] };
    }

    const obj = raw as { code?: string; message?: string | string[]; details?: unknown[] };
    if (Array.isArray(obj.message)) {
      // forma por defecto de Nest para validaciones no interceptadas
      return { code: fallbackCode, message: 'Request failed', details: obj.message };
    }
    return {
      code: obj.code ?? fallbackCode,
      message: obj.message ?? exception.message,
      details: obj.details ?? [],
    };
  }
}
