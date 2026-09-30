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
import { MAX_IMAGE_BYTES } from '@rsn/shared/util-domain';
import type { ImageStorage, ImageUploadInput } from './image-storage';
import { detectImageType } from './image-type';

/** Bucket handle of the Admin SDK, typed without importing @google-cloud/storage. */
type StorageBucket = ReturnType<ReturnType<typeof getStorage>['bucket']>;

/** IMG-6: signed URL expiry, default six hours, seven days maximum. */
const DEFAULT_SIGNED_URL_TTL_SECONDS = 21600;
const MAX_SIGNED_URL_TTL_SECONDS = 604800;

/** IMG-6: the answer to a bucket write that fails. */
const STORAGE_UNAVAILABLE_MESSAGE = 'Image storage is unavailable right now';

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
 * IMG-6: the only part of a storage error that may reach the log - its status code and
 * message. The error object itself carries the request, its URL and its headers,
 * including a live `Authorization: Bearer` token, so it is never logged or rethrown.
 */
function describeStorageError(error: unknown): string {
  if (typeof error !== 'object' || error === null) {
    return `status unknown: ${redactBearer(String(error))}`;
  }
  const { code, status, message } = error as {
    code?: unknown;
    status?: unknown;
    message?: unknown;
  };
  const statusCode =
    typeof code === 'number' || typeof code === 'string'
      ? code
      : typeof status === 'number'
        ? status
        : 'unknown';
  const text =
    typeof message === 'string' && message.length > 0
      ? message
      : 'no message';
  return `status ${statusCode}: ${redactBearer(text)}`;
}

/** IMG-6 defence in depth: a logged text never repeats a token, even if a library puts one there. */
function redactBearer(text: string): string {
  return text.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
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

    if (input.buffer.byteLength === 0) {
      throw new BadRequestException('Image is empty');
    }
    if (input.buffer.byteLength > MAX_IMAGE_BYTES) {
      throw new BadRequestException(
        `Image must not exceed ${MAX_IMAGE_BYTES} bytes`,
      );
    }
    // IMG-6: the type comes from the first bytes; the declared MIME type is not trusted.
    const detected = detectImageType(input.buffer);
    if (detected === null) {
      throw new BadRequestException('Image must be a JPEG, PNG or WebP file');
    }

    const objectPath = `recipes/${input.recipeId}/${randomUUID()}.${detected.extension}`;
    try {
      await bucket.file(objectPath).save(input.buffer, {
        contentType: detected.mimeType,
        resumable: false,
      });
    } catch (error: unknown) {
      // IMG-6: 503, and the log gets the status code and message only.
      this.logger.error(
        `Could not write image ${objectPath}: ${describeStorageError(error)}`,
      );
      throw new ServiceUnavailableException(STORAGE_UNAVAILABLE_MESSAGE);
    }
    return objectPath;
  }

  /**
   * Deletes one object; an already missing object is not an error. Any other failure
   * is rethrown as a plain Error that carries only the status code and message (IMG-6),
   * so the caller can log it (IMG-7) without the request and its token.
   */
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
      throw new Error(describeStorageError(error));
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
          // IMG-6: status code and message only, never the error object.
          this.logger.warn(
            `Could not sign a URL for ${objectPath}: ${describeStorageError(error)}`,
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
