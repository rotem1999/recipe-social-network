// SPEC §3.4 IMG-2..IMG-6: recipe images in Cloud Storage for Firebase, reached
// only by the backend. The Admin SDK is mocked at its module boundary, so no
// credential is read and no bucket is touched.

import {
  BadRequestException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { IMAGE_MIME_TYPES, MAX_IMAGE_BYTES } from '@rsn/shared/util-domain';
import { ImageStorageService } from './image-storage.service';

jest.mock('firebase-admin/app', () => {
  const cert = jest.fn((path: string) => ({ credentialFor: path }));
  const getApps = jest.fn(() => [] as { name: string }[]);
  const getApp = jest.fn((name: string) => ({ name }));
  const initializeApp = jest.fn((options: unknown, name: string) => ({
    name,
    options,
  }));
  return {
    cert,
    getApps,
    getApp,
    initializeApp,
    __mocks: { cert, getApps, getApp, initializeApp },
  };
});

jest.mock('firebase-admin/storage', () => {
  const save = jest.fn(async () => undefined);
  const remove = jest.fn(async () => undefined);
  const getSignedUrl = jest.fn(async () => ['https://signed.test/object']);
  const file = jest.fn(() => ({ save, delete: remove, getSignedUrl }));
  const bucket = jest.fn(() => ({ file }));
  const getStorage = jest.fn(() => ({ bucket }));
  return {
    getStorage,
    __mocks: { save, remove, getSignedUrl, file, bucket, getStorage },
  };
});

interface AppMocks {
  cert: jest.Mock;
  getApps: jest.Mock;
  getApp: jest.Mock;
  initializeApp: jest.Mock;
}

interface StorageMocks {
  save: jest.Mock;
  remove: jest.Mock;
  getSignedUrl: jest.Mock;
  file: jest.Mock;
  bucket: jest.Mock;
  getStorage: jest.Mock;
}

const appMocks = (
  jest.requireMock('firebase-admin/app') as { __mocks: AppMocks }
).__mocks;
const storageMocks = (
  jest.requireMock('firebase-admin/storage') as { __mocks: StorageMocks }
).__mocks;

/** IMG-6: placeholder Firebase settings; nothing here reaches a real project. */
const CONFIGURED = {
  FIREBASE_PROJECT_ID: 'test-project',
  FIREBASE_STORAGE_BUCKET: 'test-bucket.firebasestorage.app',
  FIREBASE_SERVICE_ACCOUNT_PATH: '/nowhere/service-account.json',
};

const SEVEN_DAYS_MS = 604800 * 1000;

/** IMG-6 (§16 V20): the WHATWG MIME Sniffing signatures, followed by a few body bytes. */
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);
/** `RIFF`, four length bytes, `WEBPVP`, then `8 ` of the VP8 chunk. */
const WEBP_BYTES = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56,
  0x50, 0x38, 0x20,
]);
/** `GIF89a`: a real image, but not one of the accepted types. */
const GIF_BYTES = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00]);

// SPEC §16 V16: @nestjs/config 12 ships ESM only while this Jest project is
// CommonJS (§11.1), and the unit under test imports ConfigService for DI. The
// module is mocked at its boundary so the unit loads; configuration still
// reaches it only through the explicit stub below.
jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {},
}));

function configStub(values: Record<string, string>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

function started(values: Record<string, string>): ImageStorageService {
  const service = new ImageStorageService(configStub(values));
  service.onModuleInit();
  return service;
}

describe('ImageStorageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storageMocks.getSignedUrl.mockResolvedValue(['https://signed.test/object']);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('unconfigured (IMG-6)', () => {
    it('IMG-6 stays unconfigured when the FIREBASE_* keys are empty', () => {
      const service = started({});

      expect(service.isConfigured()).toBe(false);
      expect(appMocks.initializeApp).not.toHaveBeenCalled();
      expect(storageMocks.getStorage).not.toHaveBeenCalled();
    });

    it('IMG-6 stays unconfigured when only one FIREBASE_* key is missing', () => {
      const service = started({
        FIREBASE_PROJECT_ID: CONFIGURED.FIREBASE_PROJECT_ID,
        FIREBASE_STORAGE_BUCKET: CONFIGURED.FIREBASE_STORAGE_BUCKET,
      });

      expect(service.isConfigured()).toBe(false);
    });

    it('IMG-6 answers an upload with 503 when image storage is disabled', async () => {
      const service = started({});

      await expect(
        service.upload({
          recipeId: 'recipe-1',
          buffer: Buffer.from([1, 2, 3]),
          mimeType: 'image/jpeg',
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(storageMocks.save).not.toHaveBeenCalled();
    });

    it('IMG-6 returns no signed URLs when image storage is disabled', async () => {
      const service = started({});

      await expect(service.signedUrls(['recipes/r/1.jpg'])).resolves.toEqual([]);
      expect(storageMocks.getSignedUrl).not.toHaveBeenCalled();
    });

    it('IMG-6 ignores a delete when image storage is disabled', async () => {
      const service = started({});

      await expect(service.remove('recipes/r/1.jpg')).resolves.toBeUndefined();
      expect(storageMocks.remove).not.toHaveBeenCalled();
    });
  });

  describe('configured (IMG-2, IMG-3)', () => {
    it('IMG-2 initialises the Admin SDK with the service-account path and the bucket', () => {
      const service = started(CONFIGURED);

      expect(service.isConfigured()).toBe(true);
      expect(appMocks.cert).toHaveBeenCalledWith(
        CONFIGURED.FIREBASE_SERVICE_ACCOUNT_PATH,
      );
      expect(appMocks.initializeApp).toHaveBeenCalledTimes(1);
      const [options] = appMocks.initializeApp.mock.calls[0] as [
        { projectId: string; storageBucket: string },
      ];
      expect(options.projectId).toBe(CONFIGURED.FIREBASE_PROJECT_ID);
      expect(options.storageBucket).toBe(CONFIGURED.FIREBASE_STORAGE_BUCKET);
      expect(storageMocks.bucket).toHaveBeenCalledWith(
        CONFIGURED.FIREBASE_STORAGE_BUCKET,
      );
    });

    it('IMG-6 writes a jpeg to `recipes/<recipeId>/<uuid>.jpg`', async () => {
      const service = started(CONFIGURED);
      const buffer = Buffer.from([0xff, 0xd8, 0xff]);

      const objectPath = await service.upload({
        recipeId: 'recipe-1',
        buffer,
        mimeType: 'image/jpeg',
        originalName: 'photo.JPEG',
      });

      expect(objectPath).toMatch(
        /^recipes\/recipe-1\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/,
      );
      expect(storageMocks.file).toHaveBeenCalledWith(objectPath);
      expect(storageMocks.save).toHaveBeenCalledWith(buffer, {
        contentType: 'image/jpeg',
        resumable: false,
      });
    });

    it('IMG-6 uses the png and webp extensions for the other accepted types', async () => {
      const service = started(CONFIGURED);

      await expect(
        service.upload({
          recipeId: 'r',
          buffer: PNG_BYTES,
          mimeType: 'image/png',
        }),
      ).resolves.toMatch(/\.png$/);
      await expect(
        service.upload({
          recipeId: 'r',
          buffer: WEBP_BYTES,
          mimeType: 'image/webp',
        }),
      ).resolves.toMatch(/\.webp$/);
    });

    it('IMG-6 gives every upload of a recipe its own object path', async () => {
      const service = started(CONFIGURED);
      const input = {
        recipeId: 'recipe-1',
        buffer: JPEG_BYTES,
        mimeType: 'image/jpeg',
      };

      const first = await service.upload(input);
      const second = await service.upload(input);

      expect(first).not.toBe(second);
    });

    it('IMG-6 rejects image/gif, which is outside the accepted MIME types', async () => {
      const service = started(CONFIGURED);

      await expect(
        service.upload({
          recipeId: 'recipe-1',
          buffer: GIF_BYTES,
          mimeType: 'image/gif',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storageMocks.save).not.toHaveBeenCalled();
      expect(IMAGE_MIME_TYPES).not.toContain('image/gif');
    });

    it('IMG-6 rejects an image larger than MAX_IMAGE_BYTES', async () => {
      const service = started(CONFIGURED);

      await expect(
        service.upload({
          recipeId: 'recipe-1',
          buffer: Buffer.alloc(MAX_IMAGE_BYTES + 1),
          mimeType: 'image/jpeg',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storageMocks.save).not.toHaveBeenCalled();
    });

    it('IMG-6 accepts an image of exactly MAX_IMAGE_BYTES', async () => {
      const service = started(CONFIGURED);
      const buffer = Buffer.alloc(MAX_IMAGE_BYTES);
      JPEG_BYTES.copy(buffer, 0);

      await expect(
        service.upload({
          recipeId: 'recipe-1',
          buffer,
          mimeType: 'image/jpeg',
        }),
      ).resolves.toMatch(/\.jpg$/);
    });

    it('IMG-6 rejects an empty file', async () => {
      const service = started(CONFIGURED);

      await expect(
        service.upload({
          recipeId: 'recipe-1',
          buffer: Buffer.alloc(0),
          mimeType: 'image/jpeg',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('signed URLs (IMG-4)', () => {
    it('IMG-4 signs each path for reading with an expiry inside seven days', async () => {
      const service = started(CONFIGURED);
      const before = Date.now();

      const urls = await service.signedUrls([
        'recipes/r1/a.jpg',
        'recipes/r1/b.png',
      ]);

      expect(urls).toEqual([
        'https://signed.test/object',
        'https://signed.test/object',
      ]);
      expect(storageMocks.getSignedUrl).toHaveBeenCalledTimes(2);
      const [options] = storageMocks.getSignedUrl.mock.calls[0] as [
        { action: string; expires: number },
      ];
      expect(options.action).toBe('read');
      expect(options.expires).toBeGreaterThan(before);
      expect(options.expires).toBeLessThanOrEqual(before + SEVEN_DAYS_MS);
    });

    it('IMG-6 defaults the expiry to 21600 seconds', async () => {
      const service = started(CONFIGURED);
      const before = Date.now();

      await service.signedUrls(['recipes/r1/a.jpg']);

      const [options] = storageMocks.getSignedUrl.mock.calls[0] as [
        { expires: number },
      ];
      expect(options.expires - before).toBeGreaterThanOrEqual(0);
      expect(options.expires - before).toBeLessThanOrEqual(21600 * 1000);
      expect(options.expires - before).toBeGreaterThan(21600 * 1000 - 5000);
    });

    it('IMG-6 honours IMAGE_SIGNED_URL_TTL_SECONDS', async () => {
      const service = started({
        ...CONFIGURED,
        IMAGE_SIGNED_URL_TTL_SECONDS: '60',
      });
      const before = Date.now();

      await service.signedUrls(['recipes/r1/a.jpg']);

      const [options] = storageMocks.getSignedUrl.mock.calls[0] as [
        { expires: number },
      ];
      expect(options.expires - before).toBeLessThanOrEqual(60 * 1000);
    });

    it('IMG-4 caps a configured expiry at the seven-day maximum', async () => {
      const service = started({
        ...CONFIGURED,
        IMAGE_SIGNED_URL_TTL_SECONDS: '999999999',
      });
      const before = Date.now();

      await service.signedUrls(['recipes/r1/a.jpg']);

      const [options] = storageMocks.getSignedUrl.mock.calls[0] as [
        { expires: number },
      ];
      expect(options.expires - before).toBeLessThanOrEqual(SEVEN_DAYS_MS);
    });

    it('IMG-4 keeps the order of the paths and returns an empty URL for a failure', async () => {
      const service = started(CONFIGURED);
      storageMocks.getSignedUrl
        .mockResolvedValueOnce(['https://signed.test/first'])
        .mockRejectedValueOnce(new Error('sign failed'))
        .mockResolvedValueOnce(['https://signed.test/third']);

      await expect(
        service.signedUrls(['a.jpg', 'b.jpg', 'c.jpg']),
      ).resolves.toEqual(['https://signed.test/first', '', 'https://signed.test/third']);
    });

    it('IMG-6 logs a signing failure with its status code and message only', async () => {
      const service = started(CONFIGURED);
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      storageMocks.getSignedUrl.mockRejectedValueOnce(storageFailure());

      await expect(service.signedUrls(['recipes/r1/a.jpg'])).resolves.toEqual([
        '',
      ]);

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]).toHaveLength(1);
      const [line] = warn.mock.calls[0] as [unknown];
      expect(typeof line).toBe('string');
      expect(line).toContain('status 403');
      expect(line).toContain('Permission denied on the bucket');
      expectNoRequestDetails(line as string);
    });
  });

  describe('type from the bytes (IMG-6)', () => {
    it('IMG-6 stores a JPEG declared as image/png with the detected jpg type and extension', async () => {
      const service = started(CONFIGURED);

      const objectPath = await service.upload({
        recipeId: 'recipe-1',
        buffer: JPEG_BYTES,
        mimeType: 'image/png',
      });

      expect(objectPath).toMatch(/\.jpg$/);
      expect(storageMocks.save).toHaveBeenCalledWith(JPEG_BYTES, {
        contentType: 'image/jpeg',
        resumable: false,
      });
    });

    it('IMG-6 stores a PNG declared as image/jpeg with the detected png type and extension', async () => {
      const service = started(CONFIGURED);

      const objectPath = await service.upload({
        recipeId: 'recipe-1',
        buffer: PNG_BYTES,
        mimeType: 'image/jpeg',
      });

      expect(objectPath).toMatch(/\.png$/);
      expect(storageMocks.save).toHaveBeenCalledWith(PNG_BYTES, {
        contentType: 'image/png',
        resumable: false,
      });
    });

    it('IMG-6 stores a WebP with the image/webp type', async () => {
      const service = started(CONFIGURED);

      await service.upload({
        recipeId: 'recipe-1',
        buffer: WEBP_BYTES,
        mimeType: 'application/octet-stream',
      });

      expect(storageMocks.save).toHaveBeenCalledWith(WEBP_BYTES, {
        contentType: 'image/webp',
        resumable: false,
      });
    });

    it('IMG-6 answers 400 for a text file declared as image/png', async () => {
      const service = started(CONFIGURED);

      await expect(
        service.upload({
          recipeId: 'recipe-1',
          buffer: Buffer.from('just some text, not an image', 'utf8'),
          mimeType: 'image/png',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storageMocks.save).not.toHaveBeenCalled();
    });

    it('IMG-6 answers 400 for a RIFF file that is not WebP', async () => {
      const service = started(CONFIGURED);
      // `RIFF`, four length bytes, `WAVEfm`: a WAV header, not the WebP pattern.
      const wav = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
        0x66, 0x6d,
      ]);

      await expect(
        service.upload({ recipeId: 'recipe-1', buffer: wav, mimeType: 'image/webp' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storageMocks.save).not.toHaveBeenCalled();
    });
  });

  describe('storage failures (IMG-6, IMG-7)', () => {
    it('IMG-6 answers a failed bucket write with 503 "Image storage is unavailable right now"', async () => {
      const service = started(CONFIGURED);
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      storageMocks.save.mockRejectedValueOnce(storageFailure());

      const upload = service.upload({
        recipeId: 'recipe-1',
        buffer: JPEG_BYTES,
        mimeType: 'image/jpeg',
      });

      await expect(upload).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(upload).rejects.toThrow(
        'Image storage is unavailable right now',
      );
    });

    it('IMG-6 logs a failed bucket write with its status code and message, never the request or its token', async () => {
      const service = started(CONFIGURED);
      const error = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      const failure = storageFailure();
      storageMocks.save.mockRejectedValueOnce(failure);

      await expect(
        service.upload({
          recipeId: 'recipe-1',
          buffer: JPEG_BYTES,
          mimeType: 'image/jpeg',
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      expect(error).toHaveBeenCalledTimes(1);
      // Only one string argument: no error object and no stack reach the log.
      expect(error.mock.calls[0]).toHaveLength(1);
      const [line] = error.mock.calls[0] as [unknown];
      expect(line).not.toBe(failure);
      expect(typeof line).toBe('string');
      expect(line).toContain('status 403');
      expect(line).toContain('Permission denied on the bucket');
      expectNoRequestDetails(line as string);
    });

    it('IMG-6 does not pass the storage error on as the 503 cause', async () => {
      const service = started(CONFIGURED);
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      storageMocks.save.mockRejectedValueOnce(storageFailure());

      const rejection = await service
        .upload({ recipeId: 'recipe-1', buffer: JPEG_BYTES, mimeType: 'image/jpeg' })
        .catch((reason: unknown) => reason);

      expect(rejection).toBeInstanceOf(ServiceUnavailableException);
      expect(JSON.stringify((rejection as ServiceUnavailableException).getResponse())).not.toContain(
        FAKE_TOKEN,
      );
      expect((rejection as Error).cause).toBeUndefined();
    });

    it('IMG-6 redacts a bearer token that a storage error message repeats', async () => {
      const service = started(CONFIGURED);
      const error = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      storageMocks.save.mockRejectedValueOnce(
        Object.assign(new Error(`Request failed with Bearer ${FAKE_TOKEN}`), {
          code: 401,
        }),
      );

      await expect(
        service.upload({
          recipeId: 'recipe-1',
          buffer: JPEG_BYTES,
          mimeType: 'image/jpeg',
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      const [line] = error.mock.calls[0] as [string];
      expect(line).toContain('status 401');
      expect(line).toContain('Bearer [redacted]');
      expect(line).not.toContain(FAKE_TOKEN);
    });

    it('IMG-6 redacts a bearer token when the storage client throws a plain string', async () => {
      const service = started(CONFIGURED);
      const error = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      storageMocks.save.mockRejectedValueOnce(
        'failed with Authorization: Bearer ya29.secret-token',
      );

      const upload = service.upload({
        recipeId: 'recipe-1',
        buffer: JPEG_BYTES,
        mimeType: 'image/jpeg',
      });

      await expect(upload).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(upload).rejects.toThrow(
        'Image storage is unavailable right now',
      );
      expect(error).toHaveBeenCalledTimes(1);
      expect(error.mock.calls[0]).toHaveLength(1);
      const [line] = error.mock.calls[0] as [string];
      expect(line).toMatch(
        /: status unknown: failed with Authorization: Bearer \[redacted\]$/,
      );
      expect(line).not.toContain('ya29');
    });

    it('IMG-7 rejects a failed delete with a plain Error holding only the status code and message', async () => {
      const service = started(CONFIGURED);
      const failure = storageFailure();
      storageMocks.remove.mockRejectedValueOnce(failure);

      const rejection = await service
        .remove('recipes/recipe-1/a.jpg')
        .catch((reason: unknown) => reason);

      expect(rejection).toBeInstanceOf(Error);
      expect(rejection).not.toBe(failure);
      const message = (rejection as Error).message;
      expect(message).toContain('status 403');
      expect(message).toContain('Permission denied on the bucket');
      expectNoRequestDetails(message);
      expect(Object.keys(rejection as object)).toEqual([]);
      expect(JSON.stringify(rejection)).not.toContain(FAKE_TOKEN);
    });

    it('IMG-7 treats a delete of an already missing object as done', async () => {
      const service = started(CONFIGURED);
      storageMocks.remove.mockRejectedValueOnce(
        Object.assign(new Error('No such object'), { code: 404 }),
      );

      await expect(
        service.remove('recipes/recipe-1/a.jpg'),
      ).resolves.toBeUndefined();
    });
  });
});

/** Placeholder token; the shape of a Google access token, nothing real. */
const FAKE_TOKEN = 'test-access-token-not-real';

/**
 * IMG-6: the shape of a failed Google Cloud Storage call - status, message, and the
 * request with its URL and an `Authorization: Bearer` header.
 */
function storageFailure(): Error {
  return Object.assign(new Error('Permission denied on the bucket'), {
    code: 403,
    config: {
      url: 'https://storage.test/upload/object',
      headers: { Authorization: `Bearer ${FAKE_TOKEN}` },
    },
    response: {
      config: { headers: { Authorization: `Bearer ${FAKE_TOKEN}` } },
    },
  });
}

function expectNoRequestDetails(text: string): void {
  expect(text).not.toContain(FAKE_TOKEN);
  expect(text).not.toContain('Authorization');
  expect(text).not.toContain('https://storage.test');
}
