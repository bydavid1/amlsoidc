import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';

/**
 * ValidationPipe global: whitelist estricta (rechaza campos no declarados en
 * el DTO) y errores con código estable VALIDATION_ERROR + detalle por campo.
 */
export function buildValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors: ValidationError[]) =>
      new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: errors.map((e) => ({
          field: e.property,
          errors: Object.values(e.constraints ?? {}),
        })),
      }),
  });
}
