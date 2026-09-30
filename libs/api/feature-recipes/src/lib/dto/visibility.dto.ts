// REC-2, REC-3, REC-6, REC-8 (§11.6 `PATCH /recipes/:id/visibility`).
import { IsArray, IsIn, IsOptional, IsUUID } from 'class-validator';
import { VISIBILITIES, type Visibility } from '@rsn/shared/util-domain';
import type { VisibilityRequest } from '@rsn/shared/util-contracts';

export class VisibilityDto implements VisibilityRequest {
  // UI-43: messages written for people.
  @IsIn([...VISIBILITIES], {
    message: 'Choose private, shared with friends or public',
  })
  visibility!: Visibility;

  /**
   * REC-2: only friends may be listed here; RecipesService rejects anyone
   * else, and an empty list for `shared` (UI-51).
   */
  @IsOptional()
  @IsArray({ message: 'Pick the friends to share with' })
  @IsUUID('all', { each: true, message: 'You can only share with friends' })
  sharedWithUserIds?: string[];
}
