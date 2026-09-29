import type {
  RecommendRequest,
  RecommendScope,
} from '@rsn/shared/util-contracts';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

/** WX-8/WX-9: an IANA timezone such as `Asia/Jerusalem` or `America/New_York`. */
const IANA_TIMEZONE = /^[A-Za-z_]+\/[A-Za-z_\-+]+(\/[A-Za-z_\-+]+)?$/;

/** WX-10: body of `POST /recommend`. */
export class RecommendRequestDto implements RecommendRequest {
  /** WX-9: the machine's IANA timezone; the city is the segment after the `/`. */
  @IsString()
  @Matches(IANA_TIMEZONE)
  timezone!: string;

  /** WX-2: the home tab ranks saved recipes, Discover picks one public recipe. */
  @IsIn(['home', 'discover'])
  scope!: RecommendScope;

  /** WX-5: "view next" excludes the recipes already recommended. */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  excludeRecipeIds?: string[];
}
