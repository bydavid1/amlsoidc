export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');

/** Puerto de hashing de credenciales; la impl (argon2id) vive en infrastructure. */
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
}
