export type DomainErrorKind = 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'UNPROCESSABLE';

/**
 * Error de negocio con código estable (el cliente programa contra `code`,
 * nunca contra `message`). El exception filter lo traduce a HTTP:
 * NOT_FOUND→404, FORBIDDEN→403, CONFLICT→409, UNPROCESSABLE→422.
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly kind: DomainErrorKind = 'CONFLICT',
  ) {
    super(message);
    this.name = new.target.name;
  }
}
