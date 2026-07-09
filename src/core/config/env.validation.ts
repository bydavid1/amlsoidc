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

  // ------- Pricing del viajero (docs/design/09-modelo-claim-y-pricing.md §4) -------

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  PRICING_BASE_FEE: number = 5;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  PRICING_VALUE_RATE: number = 0.05;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  PRICING_VALUE_CAP: number = 1500;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  PRICING_SIZE_FEE_SMALL: number = 3;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  PRICING_SIZE_FEE_MEDIUM: number = 8;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  PRICING_SIZE_FEE_LARGE: number = 15;

  /** Comisión de Bringo sobre el pago al viajero (ganancia de la plataforma). */
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  PRICING_PLATFORM_RATE: number = 0.2;
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

  return validated;
}
