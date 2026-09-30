// SPEC §3.4 IMG-6 (§16 V20): the image type is decided from the file's first
// bytes with the WHATWG MIME Sniffing patterns, never from the declared MIME type.

import { detectImageType } from './image-type';

const RIFF = [0x52, 0x49, 0x46, 0x46];
const LENGTH = [0x24, 0x00, 0x00, 0x00];
const WEBPVP = [0x57, 0x45, 0x42, 0x50, 0x56, 0x50];

describe('detectImageType', () => {
  it('IMG-6 detects JPEG from `FF D8 FF`', () => {
    expect(detectImageType(Uint8Array.from([0xff, 0xd8, 0xff]))).toEqual({
      mimeType: 'image/jpeg',
      extension: 'jpg',
    });
  });

  it('IMG-6 detects PNG from `89 50 4E 47 0D 0A 1A 0A`', () => {
    expect(
      detectImageType(
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toEqual({ mimeType: 'image/png', extension: 'png' });
  });

  it('IMG-6 detects WebP from exactly the 14-byte pattern `RIFF`, four length bytes, `WEBPVP`', () => {
    const bytes = Uint8Array.from([...RIFF, ...LENGTH, ...WEBPVP]);
    expect(bytes.byteLength).toBe(14);

    expect(detectImageType(bytes)).toEqual({
      mimeType: 'image/webp',
      extension: 'webp',
    });
  });

  it('IMG-6 accepts any value in the four length bytes of a WebP', () => {
    const bytes = Uint8Array.from([
      ...RIFF,
      0xff,
      0xee,
      0xdd,
      0xcc,
      ...WEBPVP,
      0x38,
      0x4c,
    ]);

    expect(detectImageType(bytes)?.mimeType).toBe('image/webp');
  });

  it('IMG-6 rejects a WebP header one byte short of the 14-byte pattern', () => {
    const bytes = Uint8Array.from([...RIFF, ...LENGTH, ...WEBPVP.slice(0, 5)]);
    expect(bytes.byteLength).toBe(13);

    expect(detectImageType(bytes)).toBeNull();
  });

  it('IMG-6 rejects `RIFF` + `WEBP` without the `VP` of the 14-byte pattern', () => {
    const bytes = Uint8Array.from([
      ...RIFF,
      ...LENGTH,
      0x57,
      0x45,
      0x42,
      0x50,
      0x41,
      0x42,
    ]);

    expect(detectImageType(bytes)).toBeNull();
  });

  it('IMG-6 rejects `WEBPVP` that does not start at offset 8 after `RIFF`', () => {
    const bytes = Uint8Array.from([0x00, ...LENGTH, ...LENGTH, ...WEBPVP]);

    expect(detectImageType(bytes)).toBeNull();
  });

  it('IMG-6 rejects a file shorter than a signature', () => {
    expect(detectImageType(Uint8Array.from([0xff, 0xd8]))).toBeNull();
    expect(
      detectImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a])),
    ).toBeNull();
    expect(detectImageType(new Uint8Array(0))).toBeNull();
  });

  it('IMG-6 rejects a GIF and a text file', () => {
    expect(
      detectImageType(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])),
    ).toBeNull();
    expect(detectImageType(Buffer.from('hello, not an image', 'utf8'))).toBeNull();
  });

  it('IMG-6 reads a Node Buffer the same way as a Uint8Array', () => {
    expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xdb]))).toEqual({
      mimeType: 'image/jpeg',
      extension: 'jpg',
    });
  });
});
