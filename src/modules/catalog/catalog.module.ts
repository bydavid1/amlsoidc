import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { CatalogService } from './application/catalog.service';
import { RecommendedProductsController } from './interface/http/controllers/recommended-products.controller';

/** Curaduría de productos recomendados. Usa el pricing de orders para mostrar totales. */
@Module({
  imports: [OrdersModule],
  controllers: [RecommendedProductsController],
  providers: [CatalogService],
  // admin compone el CRUD con permisos elevados
  exports: [CatalogService],
})
export class CatalogModule {}
