import { Module } from '@nestjs/common';
import { CoreModule } from './core/core.module';
import { AuthModule } from './modules/auth/auth.module';
import { GeographyModule } from './modules/geography/geography.module';
import { IdentityModule } from './modules/identity/identity.module';

@Module({
  imports: [CoreModule, GeographyModule, IdentityModule, AuthModule],
})
export class AppModule {}
