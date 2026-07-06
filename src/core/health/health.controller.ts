import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../shared/auth/decorators';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Health')
@Controller('health')
@Public()
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liveness: el proceso responde' })
  @HealthCheck()
  liveness(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness: dependencias (PostgreSQL) disponibles' })
  @HealthCheck()
  readiness(): Promise<HealthCheckResult> {
    return this.health.check([
      async (): Promise<HealthIndicatorResult> => {
        await this.prisma.client.$queryRaw`SELECT 1`;
        return { database: { status: 'up' } };
      },
    ]);
  }
}
