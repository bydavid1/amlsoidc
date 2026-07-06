import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PasswordHasher } from '../../domain/services/password-hasher';

/** argon2id: algoritmo lento con sal, recomendado OWASP (docs/design/05-seguridad.md). */
@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }
}
