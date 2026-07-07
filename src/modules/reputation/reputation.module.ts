import { Module } from '@nestjs/common';
import { MatchingModule } from '../matching/matching.module';
import { OrdersModule } from '../orders/orders.module';
import { TripsModule } from '../trips/trips.module';
import { RateCounterpartUseCase } from './application/use-cases/rate-counterpart.use-case';
import { RATING_REPOSITORY } from './domain/repositories/rating.repository';
import { PrismaRatingRepository } from './infrastructure/persistence/prisma/prisma-rating.repository';
import { RatingsController } from './interface/http/controllers/ratings.controller';

/** Acíclico: nadie depende de reputation salvo por eventos (trips escucha el snapshot). */
@Module({
  imports: [OrdersModule, TripsModule, MatchingModule],
  controllers: [RatingsController],
  providers: [
    { provide: RATING_REPOSITORY, useClass: PrismaRatingRepository },
    RateCounterpartUseCase,
  ],
})
export class ReputationModule {}
