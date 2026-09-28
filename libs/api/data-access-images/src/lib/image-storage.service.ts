import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { IMAGE_MIME_TYPES, MAX_IMAGE_BYTES } from '@rsn/shared/util-domain';
import type { ImageStorage, ImageUploadInput } from './image-storage';

/** Bucket handle of the Admin SDK, typed without importing @google-cloud/storage. */
type StorageBucket = ReturnType<ReturnType<typeof getStorage>['bucket']>;

/** IMG-6: signed URL expiry, default six hours, seven days maximum. */
const DEFAULT_SIGNED_URL_TTL_SECONDS = 21600;
const MAX_SIGNED_URL_TTL_SECONDS = 604800;

/** IMG-6: object path extension per accepted MIME type. */
const EXTENSION_BY_MIME_TYPE: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Name of the Firebase app this library initialises (IMG-2). */
const FIREBASE_APP_NAME = 'rsn-images';

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 404
  );
}

/**
 * IMG-1..IMG-6: recipe images in Cloud Storage for Firebase, reached only by
 * the backend through the Admin SDK with a service-account credential.
 */
@Injectable()
export class ImageStorageService implements ImageStorage, OnModuleInit {
  private readonly logger = new Logger(ImageStorageService.name);
  private bucket: StorageBucket | null = null;
  private ttlSeconds = DEFAULT_SIGNED_URL_TTL_SECONDS;

  constructor(private readonly config: ConfigService) {}

  /** IMG-6: with any FIREBASE_* key empty the service stays unconfigured. */
  onModuleInit(): void {
    const projectId = this.read('FIREBASE_PROJECT_ID');
    const storageBucket = this.read('FIREBASE_STORAGE_BUCKET');
    const serviceAccountPath = this.read('FIREBASE_SERVICE_ACCOUNT_PATH');
    this.ttlSeconds = this.readTtlSeconds();

    if (!projectId || !storageBucket || !serviceAccountPath) {
      this.logger.warn(
        'FIREBASE_PROJECT_ID, FIREBASE_STORAGE_BUCKET or FIREBASE_SERVICE_ACCOUNT_PATH is empty; image storage is disabled',
      );
      return;
    }

    // Guard against a second initialisation of the same named app.
    const app = getApps().some(
      (existing) => existing.name === FIREBASE_APP_NAME,
    )
      ? getApp(FIREBASE_APP_NAME)
      : initializeApp(
          {
            // `cert` accepts the path of the service-account JSON (IMG-2).
            credential: cert(serviceAccountPath),
            projectId,
            storageBucket,
          },
          FIREBASE_APP_NAME,
        );

    this.bucket = getStorage(app).bucket(storageBucket);
  }

  /** IMG-6 */
  isConfigured(): boolean {
    return this.bucket !== null;
  }

  /** IMG-3, IMG-6: validate, write the bytes, return the object path. */
  async upload(input: ImageUploadInput): Promise<string> {
    const bucket = this.bucket;
    if (bucket === null) {
      throw new ServiceUnavailableException('Image storage is not configured');
    }

    const extension = EXTENSION_BY_MIME_TYPE[input.mimeType];
    if (extension === undefined) {
      throw new BadRequestException(
        `Image type must be one of ${IMAGE_MIME_TYPES.join(', ')}`,
      );
    }
    if (input.buffer.byteLength === 0) {
      throw new BadRequestException('Image is empty');
    }
    if (input.buffer.byteLength > MAX_IMAGE_BYTES) {
      throw new BadRequestException(
        `Image must not exceed ${MAX_IMAGE_BYTES} bytes`,
      );
    }

    const objectPath = `recipes/${input.recipeId}/${randomUUID()}.${extension}`;
    await bucket
      .file(objectPath)
      .save(input.buffer, { contentType: input.mimeType, resumable: false });
    return objectPath;
  }

  /** Deletes one object; an already missing object is not an error. */
  async remove(objectPath: string): Promise<void> {
    const bucket = this.bucket;
    if (bucket === null) {
      return;
    }
    try {
      await bucket.file(objectPath).delete();
    } catch (error: unknown) {
      if (isNotFound(error)) {
        return;
      }
      throw error;
    }
  }

  /** IMG-4, IMG-6: one read signed URL per path, same order; '' on failure. */
  async signedUrls(objectPaths: string[]): Promise<string[]> {
    const bucket = this.bucket;
    if (bucket === null) {
      return [];
    }
    const expires = Date.now() + this.ttlSeconds * 1000;
    return Promise.all(
      objectPaths.map(async (objectPath) => {
        try {
          const [url] = await bucket
            .file(objectPath)
            .getSignedUrl({ action: 'read', expires, version: 'v4' });
          return url;
        } catch (error: unknown) {
          this.logger.warn(
            `Could not sign a URL for ${objectPath}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return '';
        }
      }),
    );
  }

  private read(key: string): string {
    return (this.config.get<string>(key) ?? '').trim();
  }

  /** IMG-6: IMAGE_SIGNED_URL_TTL_SECONDS, default 21600, capped at 604800. */
  private readTtlSeconds(): number {
    const raw = this.read('IMAGE_SIGNED_URL_TTL_SECONDS');
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return DEFAULT_SIGNED_URL_TTL_SECONDS;
    }
    return Math.min(parsed, MAX_SIGNED_URL_TTL_SECONDS);
  }
}
