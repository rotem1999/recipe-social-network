import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type AuthUser,
  CurrentUser,
  UserResponseDto,
} from '@rsn/api/feature-auth';
import { ApiErrorResponses } from '@rsn/api/util-openapi';
import { DiscoverService } from './discover.service';
import { CataloguePreviewParamsDto } from './dto/catalogue-preview-params.dto';
import {
  CataloguePreviewResponseDto,
  DiscoverResponseDto,
} from './dto/discover-response.dto';
import { DiscoverQueryDto } from './dto/discover-query.dto';
import { FavouriteCategoriesDto } from './dto/favourite-categories.dto';

/** §11.6: the Discover routes (DISC-1..9, CAT-2). Paths sit under the global prefix. */
@ApiTags('discover')
@ApiBearerAuth()
@Controller()
export class DiscoverController {
  constructor(private readonly discoverService: DiscoverService) {}

  /** DISC-9 `GET /discover?category=&page=`. */
  @ApiErrorResponses(400, 401)
  @Get('discover')
  discover(
    @CurrentUser() user: AuthUser,
    @Query() query: DiscoverQueryDto,
  ): Promise<DiscoverResponseDto> {
    return this.discoverService.discover(user, query.category, query.page ?? 1);
  }

  /** CAT-2, DISC-10 `GET /discover/catalogue/:mealId` — the live preview of one meal. */
  @ApiErrorResponses(400, 401, 404, 503)
  @Get('discover/catalogue/:mealId')
  cataloguePreview(
    @CurrentUser() user: AuthUser,
    @Param() params: CataloguePreviewParamsDto,
  ): Promise<CataloguePreviewResponseDto> {
    return this.discoverService.cataloguePreview(user.id, params.mealId);
  }

  /** DISC-6 `PUT /me/favourite-categories` — at most 3, returns the updated user. */
  @ApiErrorResponses(400, 401)
  @Put('me/favourite-categories')
  setFavouriteCategories(
    @CurrentUser() user: AuthUser,
    @Body() body: FavouriteCategoriesDto,
  ): Promise<UserResponseDto> {
    return this.discoverService.setFavouriteCategories(
      user.id,
      body.categories,
    );
  }
}
