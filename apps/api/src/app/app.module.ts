// Root module (SPEC §11.3 apps/api): configuration, database, and the eight feature modules.
// Nothing else lives here (apps/api/CLAUDE.md).
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DbModule } from '@rsn/api/data-access-db';
import { AuthModule } from '@rsn/api/feature-auth';
import { CookModule } from '@rsn/api/feature-cook';
import { DiscoverModule } from '@rsn/api/feature-discover';
import { FriendsModule } from '@rsn/api/feature-friends';
import { NutritionModule } from '@rsn/api/feature-nutrition';
import { RecipesModule } from '@rsn/api/feature-recipes';
import { RecommendModule } from '@rsn/api/feature-recommend';
import { SocialModule } from '@rsn/api/feature-social';
import { AppController } from './app.controller';

@Module({
  imports: [
    // §14: .env.local first, then .env, both at the repository root.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'] }),
    DbModule,
    AuthModule,
    RecipesModule,
    FriendsModule,
    DiscoverModule,
    SocialModule,
    CookModule,
    NutritionModule,
    RecommendModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
