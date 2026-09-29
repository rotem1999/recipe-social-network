import { Module } from '@nestjs/common';
import { DbModule } from '@rsn/api/data-access-db';
import { AuthModule } from '@rsn/api/feature-auth';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';
import { UserSearchController } from './user-search.controller';

/** §4 (FR-1..FR-4): the friend system; `FriendsService` also drives sharing in feature-recipes. */
@Module({
  imports: [DbModule, AuthModule],
  controllers: [FriendsController, UserSearchController],
  providers: [FriendsService],
  exports: [FriendsService],
})
export class FriendsModule {}
