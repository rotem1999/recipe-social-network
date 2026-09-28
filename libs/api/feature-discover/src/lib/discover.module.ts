import { Module } from '@nestjs/common';
import { TheMealDbModule } from '@rsn/api/data-access-themealdb';
import { AuthModule } from '@rsn/api/feature-auth';
import { RecipesModule } from '@rsn/api/feature-recipes';
import { DiscoverController } from './discover.controller';
import { DiscoverService } from './discover.service';

/** §5, §11.6: the Discover tab (DISC-1..9) and the catalogue preview (CAT-2). */
@Module({
  imports: [AuthModule, RecipesModule, TheMealDbModule],
  controllers: [DiscoverController],
  providers: [DiscoverService],
  exports: [DiscoverService],
})
export class DiscoverModule {}
