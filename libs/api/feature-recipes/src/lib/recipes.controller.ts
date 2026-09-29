/// <reference types="multer" />
// §11.6: the `/recipes` routes. The global JwtAuthGuard of feature-auth (AUTH-8) makes
// every route here authenticated, so the caller always arrives through @CurrentUser().
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Patch,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, type AuthUser } from '@rsn/api/feature-auth';
import { MAX_IMAGE_BYTES } from '@rsn/shared/util-domain';
import type {
  ImageUploadResponse,
  RecipeDetailDto,
  RecipeListResponse,
  RecipeVersionsResponse,
} from '@rsn/shared/util-contracts';
import { RecipeWriteDto } from './dto/recipe-write.dto';
import { VisibilityDto } from './dto/visibility.dto';
import { RecipesService } from './recipes.service';

@Controller('recipes')
export class RecipesController {
  constructor(private readonly recipes: RecipesService) {}

  /** SAVE-3: own, saved and shared-with-me recipes. */
  @Get()
  list(@CurrentUser() user: AuthUser): Promise<RecipeListResponse> {
    return this.recipes.listMine(user.id);
  }

  /** REC-1: create a private recipe with version 1. */
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: RecipeWriteDto,
  ): Promise<RecipeDetailDto> {
    return this.recipes.create(user.id, body);
  }

  /** CAT-3, CAT-4: pull a TheMealDB meal into the caller's account. */
  @Post('catalogue/:mealId/save')
  saveCatalogue(
    @CurrentUser() user: AuthUser,
    @Param('mealId') mealId: string,
  ): Promise<RecipeDetailDto> {
    return this.recipes.saveCatalogue(user.id, mealId);
  }

  /** REC-4: the current version, with the caller's permissions on it. */
  @Get(':id')
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RecipeDetailDto> {
    return this.recipes.get(user.id, id);
  }

  /** REC-7: the version history. */
  @Get(':id/versions')
  listVersions(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RecipeVersionsResponse> {
    return this.recipes.listVersions(user.id, id);
  }

  /** REC-7: one past version. */
  @Get(':id/versions/:n')
  getVersion(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('n', ParseIntPipe) versionNumber: number,
  ): Promise<RecipeDetailDto> {
    return this.recipes.getVersion(user.id, id, versionNumber);
  }

  /** REC-6/7, SAVE-5/6: an edit by the owner adds a version. */
  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RecipeWriteDto,
  ): Promise<RecipeDetailDto> {
    return this.recipes.update(user.id, id, body);
  }

  /** REC-2, REC-3, REC-8. */
  @Patch(':id/visibility')
  setVisibility(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: VisibilityDto,
  ): Promise<RecipeDetailDto> {
    return this.recipes.setVisibility(
      user.id,
      id,
      body.visibility,
      body.sharedWithUserIds,
    );
  }

  /** REC-6, SAVE-4. */
  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.recipes.remove(user.id, id);
  }

  /** SAVE-1, SAVE-4, SAVE-7: copy a public recipe to the caller. */
  @Post(':id/save')
  save(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RecipeDetailDto> {
    return this.recipes.save(user.id, id);
  }

  /** SAVE-10: the caller's copy takes the source's current version. */
  @Post(':id/sync')
  sync(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RecipeDetailDto> {
    return this.recipes.sync(user.id, id);
  }

  /** IMG-3, IMG-6: multipart field `file`, at most MAX_IMAGE_BYTES. */
  @Post(':id/images')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES } }),
  )
  addImage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ImageUploadResponse> {
    // IMG-6: the upload is `multipart/form-data` with a field named `file`.
    if (file === undefined || file === null) {
      throw new BadRequestException(
        'A multipart field named "file" is required',
      );
    }
    return this.recipes.addImage(user.id, id, file);
  }

  /** IMG-3: drop one image of the current version. */
  @Delete(':id/images/:index')
  removeImage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('index', ParseIntPipe) index: number,
  ): Promise<ImageUploadResponse> {
    return this.recipes.removeImage(user.id, id, index);
  }
}
