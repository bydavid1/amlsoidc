import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { EnvironmentVariables } from '../../../core/config/env.validation';
import { PrismaService } from '../../../core/prisma/prisma.service';

/**
 * Refresh tokens opacos con ROTACIÓN y DETECCIÓN DE REUSO
 * (docs/design/05-seguridad.md §1):
 * - se persiste solo el hash (sha256), nunca el token en claro;
 * - cada uso emite uno nuevo e invalida el anterior (misma familyId);
 * - si llega un token ya revocado → toda la familia se revoca (señal de robo).
 */
@Injectable()
export class RefreshTokenStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async issue(userId: string): Promise<string> {
    const raw = this.generate();
    await this.prisma.client.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hash(raw),
        familyId: randomUUID(),
        expiresAt: this.expiry(),
      },
    });
    return raw;
  }

  /** Rota el token: devuelve uno nuevo de la misma familia o lanza 401. */
  async rotate(raw: string): Promise<{ token: string; userId: string }> {
    const row = await this.prisma.client.refreshToken.findUnique({
      where: { tokenHash: this.hash(raw) },
    });

    if (!row) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token is not valid',
      });
    }

    if (row.revokedAt) {
      // reuso de un token ya rotado = posible robo → se quema toda la familia
      await this.revokeFamily(row.familyId);
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_REUSED',
        message: 'Refresh token reuse detected; session revoked',
      });
    }

    if (row.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_EXPIRED',
        message: 'Refresh token expired',
      });
    }

    const next = this.generate();
    await this.prisma.runInTransaction(async () => {
      await this.prisma.client.refreshToken.update({
        where: { id: row.id },
        data: { revokedAt: new Date() },
      });
      await this.prisma.client.refreshToken.create({
        data: {
          userId: row.userId,
          tokenHash: this.hash(next),
          familyId: row.familyId,
          expiresAt: this.expiry(),
        },
      });
    });

    return { token: next, userId: row.userId };
  }

  /** Logout: revoca la familia completa del token presentado. */
  async revokeByRawToken(raw: string): Promise<void> {
    const row = await this.prisma.client.refreshToken.findUnique({
      where: { tokenHash: this.hash(raw) },
    });
    if (row) {
      await this.revokeFamily(row.familyId);
    }
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.client.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private generate(): string {
    return randomBytes(48).toString('base64url');
  }

  private hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private expiry(): Date {
    const ttl = this.config.get('JWT_REFRESH_EXPIRES_IN', { infer: true });
    return new Date(Date.now() + parseDurationMs(ttl));
  }
}

/** Convierte '15m' | '7d' | '12h' | '30s' a milisegundos. */
export function parseDurationMs(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) {
    throw new Error(`Duración inválida: "${value}" (use 30s, 15m, 12h o 7d)`);
  }
  const amount = Number(match[1]);
  const unit = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as 's' | 'm' | 'h' | 'd'];
  return amount * unit;
}
