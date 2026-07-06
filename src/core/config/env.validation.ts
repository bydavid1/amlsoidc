import { plainToInstance, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

/**
 * Configuración tipada y validada al arranque (fail-fast): si falta un secreto
 * o los pesos del matching no suman 1, la app NO arranca.
 */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  PORT: number = 3000;

  @IsString()
  @MinLength(1)
  DATABASE_URL: string;

  @IsString()
  @MinLength(16)
  JWT_ACCESS_SECRET: string;

  @IsString()
  JWT_ACCESS_EXPIRES_IN: string = '15m';

  @IsString()
  @MinLength(16)
  JWT_REFRESH_SECRET: string;

  @IsString()
  JWT_REFRESH_EXPIRES_IN: string = '7d';

  @IsOptional()
  @IsString()
  CORS_ORIGINS?: string;

  @Type(() => Boolean)
  @IsBoolean()
  SWAGGER_ENABLED: boolean = true;

  @IsOptional()
  @IsString()
  REDIS_URL?: string;

  @IsOptional()
  @IsString()
  SMTP_HOST?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  SMTP_PORT?: number;

  // ------------------- Matching (docs/design/06-matching.md §8) -------------------

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  MATCH_REPUTATION_MIN: number = 0;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  MATCH_REPUTATION_COLD_START: number = 3.5;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  MATCH_W_TIME: number = 0.35;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  MATCH_W_REPUTATION: number = 0.3;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  MATCH_W_CAPACITY: number = 0.15;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  MATCH_W_FAIRNESS: number = 0.15;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  MATCH_W_LOAD: number = 0.05;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  MATCH_ACCEPTANCE_WINDOW_MINUTES: number = 30;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  MATCH_MAX_REASSIGN_ATTEMPTS: number = 5;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  MATCH_MAX_CANDIDATES: number = 20;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  MATCH_MAX_PARALLEL_PER_TRAVELER: number = 3;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: false,
    exposeDefaultValues: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false, whitelist: false });
  if (errors.length > 0) {
    const detail = errors
      .map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join(' | ');
    throw new Error(`Configuración inválida (fail-fast): ${detail}`);
  }

  const weightSum =
    validated.MATCH_W_TIME +
    validated.MATCH_W_REPUTATION +
    validated.MATCH_W_CAPACITY +
    validated.MATCH_W_FAIRNESS +
    validated.MATCH_W_LOAD;
  if (Math.abs(weightSum - 1) > 1e-6) {
    throw new Error(
      `Configuración inválida: los pesos MATCH_W_* deben sumar 1 (suman ${weightSum})`,
    );
  }

  return validated;
}
