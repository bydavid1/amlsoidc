import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ClassSerializerInterceptor } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TerminusModule } from '@nestjs/terminus';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { CLOCK } from '../shared/domain/ports/clock';
import { EVENT_BUS } from '../shared/domain/ports/event-bus';
import { ID_GENERATOR } from '../shared/domain/ports/id-generator';
import { UNIT_OF_WORK } from '../shared/domain/ports/unit-of-work';
import { EnvironmentVariables, NodeEnv, validateEnv } from './config/env.validation';
import { EmitterEventBus } from './events/emitter-event-bus';
import { AllExceptionsFilter } from './http/all-exceptions.filter';
import { ResponseEnvelopeInterceptor } from './http/response-envelope.interceptor';
import { buildValidationPipe } from './http/validation.pipe';
import { HealthController } from './health/health.controller';
import { PrismaService } from './prisma/prisma.service';
import { PrismaUnitOfWork } from './prisma/prisma-unit-of-work';
import { SystemClock } from './runtime/system-clock';
import { UuidGenerator } from './runtime/uuid-generator';

/**
 * Módulo transversal @Global: config validada, logging estructurado con
 * request-id, Prisma + UnitOfWork, bus de eventos, envelope y errores
 * estándar, rate limiting base y health checks.
 * (docs/design/02-arquitectura.md — sección core/)
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        pinoHttp: {
          genReqId: (req: IncomingMessage, res: ServerResponse) => {
            const header = req.headers['x-request-id'];
            const id = (Array.isArray(header) ? header[0] : header) ?? randomUUID();
            res.setHeader('X-Request-Id', id);
            return id;
          },
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          customProps: (req: IncomingMessage) => ({
            requestId: (req as IncomingMessage & { id?: string }).id,
          }),
          transport:
            config.get('NODE_ENV', { infer: true }) === NodeEnv.Development
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    TerminusModule,
  ],
  controllers: [HealthController],
  providers: [
    PrismaService,
    { provide: UNIT_OF_WORK, useClass: PrismaUnitOfWork },
    { provide: EVENT_BUS, useClass: EmitterEventBus },
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidGenerator },
    { provide: APP_PIPE, useFactory: buildValidationPipe },
    // orden importa: Serializer primero (outermost) para que Envelope (inner)
    // reciba la instancia intacta y detecte PaginatedResult antes de serializar
    { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  exports: [PrismaService, UNIT_OF_WORK, EVENT_BUS, CLOCK, ID_GENERATOR],
})
export class CoreModule {}
