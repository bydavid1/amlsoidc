import { VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { EnvironmentVariables, NodeEnv } from './core/config/env.validation';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService<EnvironmentVariables, true>);
  const nodeEnv = config.get('NODE_ENV', { infer: true });
  const swaggerEnabled =
    config.get('SWAGGER_ENABLED', { infer: true }) && nodeEnv !== NodeEnv.Production;

  // Swagger UI necesita CSP relajada; solo se relaja cuando está habilitado (dev)
  app.use(helmet({ contentSecurityPolicy: swaggerEnabled ? false : undefined }));

  const corsOrigins = (config.get('CORS_ORIGINS', { infer: true }) ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins.length > 0 ? corsOrigins : false, credentials: true });

  // API First: /api/v1/... — breaking changes implican /api/v2 conviviendo
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  if (swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Bringo API')
        .setDescription(
          'Plataforma logística colaborativa: conecta Buyers con Travelers que regresan de otros países. ' +
            'Diseño: docs/design/00-diseno-bringo.md',
        )
        .setVersion('1.0')
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document);
  }

  app.enableShutdownHooks();
  await app.listen(config.get('PORT', { infer: true }));
}

void bootstrap();
