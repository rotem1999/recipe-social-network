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
  MaxLength,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

/** WX-10: a `timezone` is at most 64 characters. */
const TIMEZONE_MAX_LENGTH = 64;

/** UI-43: the text a person sees for any unusable `timezone`. */
const UNKNOWN_TIME_ZONE = 'Unknown time zone';

/**
 * WX-9/WX-10 (BUG-026): any zone name the runtime's `Intl.DateTimeFormat`
 * accepts, so `UTC`, `GMT` and `Etc/GMT+2` are valid and simply get no weather
 * context (WX-9's no-city rule), while `Foo/Bar` is a 400.
 */
@ValidatorConstraint({ name: 'isKnownTimeZone' })
export class KnownTimeZoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || value.length === 0) return false;
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      // RangeError: not a zone this runtime knows.
      return false;
    }
  }

  defaultMessage(): string {
    return UNKNOWN_TIME_ZONE;
  }
}

/** WX-10: body of `POST /recommend`. */
export class RecommendRequestDto implements RecommendRequest {
  /** WX-9: the machine's timezone; the city, if any, is the segment after the last `/`. */
  @IsString({ message: UNKNOWN_TIME_ZONE })
  @MaxLength(TIMEZONE_MAX_LENGTH, { message: UNKNOWN_TIME_ZONE })
  @Validate(KnownTimeZoneConstraint, { message: UNKNOWN_TIME_ZONE })
  timezone!: string;

  /** WX-2: the home tab ranks saved recipes, Discover picks one public recipe. */
  @IsIn(['home', 'discover'], {
    message: 'Recommendations are for Home or Discover',
  })
  scope!: RecommendScope;

  /** WX-5: "view next" excludes the recipes already recommended. */
  @IsOptional()
  @IsArray({ message: 'The recipes to skip must be a list' })
  @IsUUID('4', {
    each: true,
    message: 'Every recipe to skip must be a recipe id',
  })
  excludeRecipeIds?: string[];
}
