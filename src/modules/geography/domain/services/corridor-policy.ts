export const CORRIDOR_POLICY = Symbol('CORRIDOR_POLICY');

/**
 * Puerto publicado del módulo geography: orders/trips lo consultan para
 * validar que un corredor esté habilitado. Multi-corredor por DATOS:
 * habilitar ES→SV es insertar una fila, no tocar código.
 */
export interface CorridorPolicy {
  isEnabled(originCountryId: string, destinationCountryId: string): Promise<boolean>;
}
