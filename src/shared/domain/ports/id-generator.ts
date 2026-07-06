export const ID_GENERATOR = Symbol('ID_GENERATOR');

/** Generador de ids inyectable (determinismo en tests; uuid en runtime). */
export interface IdGenerator {
  next(): string;
}
