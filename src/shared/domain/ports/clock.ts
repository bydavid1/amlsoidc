export const CLOCK = Symbol('CLOCK');

/** Reloj inyectable: el dominio nunca llama a `new Date()` (determinismo en tests). */
export interface Clock {
  now(): Date;
}
