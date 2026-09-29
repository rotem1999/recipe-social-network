// §3, §11.3: the central feature module. Other feature libraries import it for
// RecipeAccessService (who may cook/view) and RecipeDtoService (card and detail bodies).
import { Module } from '@nestjs/common';
import { DbModule } from '@rsn/api/data-access-db';
import { ImagesModule } from '@rsn/api/data-access-images';
import { TheMealDbModule } from '@rsn/api/data-access-themealdb';
import { AuthModule } from '@rsn/api/feature-auth';
import { FriendsModule } from '@rsn/api/feature-friends';
import { RecipeAccessService } from './recipe-access.service';
import { RecipeDtoService } from './recipe-dto.service';
import { RecipesController } from './recipes.controller';
import { RecipesService } from './recipes.service';

@Module({
  imports: [DbModule, AuthModule, FriendsModule, ImagesModule, TheMealDbModule],
  controllers: [RecipesController],
  providers: [RecipesService, RecipeAccessService, RecipeDtoService],
  exports: [RecipesService, RecipeAccessService, RecipeDtoService],
})
export class RecipesModule {}
