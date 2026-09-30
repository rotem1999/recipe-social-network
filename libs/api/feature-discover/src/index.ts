// Public surface of @rsn/api/feature-discover (§5, §11.3, §11.6).

export { DiscoverModule } from './lib/discover.module';
export { DiscoverService } from './lib/discover.service';
export { DiscoverController } from './lib/discover.controller';
export { DiscoverQueryDto } from './lib/dto/discover-query.dto';
export { CataloguePreviewParamsDto } from './lib/dto/catalogue-preview-params.dto';
export { FavouriteCategoriesDto } from './lib/dto/favourite-categories.dto';
export {
  CatalogueItemResponseDto,
  CataloguePreviewResponseDto,
  DiscoverCategoryResponseDto,
  DiscoverResponseDto,
} from './lib/dto/discover-response.dto';
