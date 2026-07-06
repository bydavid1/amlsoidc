import { Module } from '@nestjs/common';
import { GEOGRAPHY_REPOSITORY } from './domain/repositories/geography.repository';
import { CORRIDOR_POLICY } from './domain/services/corridor-policy';
import { PrismaGeographyRepository } from './infrastructure/persistence/prisma/prisma-geography.repository';
import { LocationsController } from './interface/http/controllers/locations.controller';

@Module({
  controllers: [LocationsController],
  providers: [
    PrismaGeographyRepository,
    { provide: GEOGRAPHY_REPOSITORY, useExisting: PrismaGeographyRepository },
    { provide: CORRIDOR_POLICY, useExisting: PrismaGeographyRepository },
  ],
  // puertos publicados: orders/trips validan corredores y resuelven catálogos
  exports: [GEOGRAPHY_REPOSITORY, CORRIDOR_POLICY],
})
export class GeographyModule {}
