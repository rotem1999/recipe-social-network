import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { CATEGORIES, type Category } from '@rsn/shared/util-domain';

/** §11.6 `GET /discover?category=&page=` query — DISC-9. */
export class DiscoverQueryDto {
  /** DISC-7: one of the 14 TheMealDB categories; absent means the split view (DISC-5). */
  @IsOptional()
  @IsIn(CATEGORIES)
  category?: Category;

  /** DISC-9: 1-based page of the public recipes of one category. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}
