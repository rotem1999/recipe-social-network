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
          buffer: Buffer.from([1]),
          mimeType: 'image/png',
        }),
      ).resolves.toMatch(/\.png$/);
      await expect(
        service.upload({
          recipeId: 'r',
          buffer: Buffer.from([1]),
          mimeType: 'image/webp',
        }),
      ).resolves.toMatch(/\.webp$/);
    });

    it('IMG-6 gives every upload of a recipe its own object path', async () => {
      const service = started(CONFIGURED);
      const input = {
        recipeId: 'recipe-1',
        buffer: Buffer.from([1]),
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
          buffer: Buffer.from([1, 2, 3]),
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

      await expect(
        service.upload({
          recipeId: 'recipe-1',
          buffer: Buffer.alloc(MAX_IMAGE_BYTES),
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
  });
});
