import { Module } from '@nestjs/common';
import { DbModule } from '@rsn/api/data-access-db';
import { AuthModule } from '@rsn/api/feature-auth';
import { RecipesModule } from '@rsn/api/feature-recipes';
import { CommentsService } from './comments.service';
import { RatingsService } from './ratings.service';
import { SocialController } from './social.controller';

/** §6: ratings (RATE-1..4) and comments with votes (COM-1..3). */
@Module({
  imports: [DbModule, AuthModule, RecipesModule],
  controllers: [SocialController],
  providers: [RatingsService, CommentsService],
  exports: [RatingsService, CommentsService],
})
export class SocialModule {}
