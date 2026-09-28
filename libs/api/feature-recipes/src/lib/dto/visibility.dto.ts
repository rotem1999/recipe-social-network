// REC-2, REC-3, REC-6, REC-8 (§11.6 `PATCH /recipes/:id/visibility`).
import { IsArray, IsIn, IsOptional, IsUUID } from 'class-validator';
import { VISIBILITIES, type Visibility } from '@rsn/shared/util-domain';
import type { VisibilityRequest } from '@rsn/shared/util-contracts';

export class VisibilityDto implements VisibilityRequest {
  @IsIn([...VISIBILITIES])
  visibility!: Visibility;

  /** REC-2: only friends may be listed here; RecipesService rejects anyone else. */
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  sharedWithUserIds?: string[];
}
