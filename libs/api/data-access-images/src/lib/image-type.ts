import { IMAGE_MIME_TYPES } from '@rsn/shared/util-domain';

/** IMG-6: one of the accepted image types, as detected from the file's bytes. */
export interface DetectedImageType {
  mimeType: (typeof IMAGE_MIME_TYPES)[number];
  /** Extension of the object path `recipes/<recipeId>/<uuid>.<ext>`. */
  extension: 'jpg' | 'png' | 'webp';
}

/** IMG-6: JPEG starts `FF D8 FF`. */
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
/** IMG-6: PNG starts `89 50 4E 47 0D 0A 1A 0A`. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/**
 * IMG-6: WebP starts `RIFF`, four bytes of any value, then `WEBPVP` at offset 8
 * (the 14-byte WHATWG MIME Sniffing pattern).
 */
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46];
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50, 0x56, 0x50];
const WEBP_SIGNATURE_OFFSET = 8;

function startsWith(
  bytes: Uint8Array,
  signature: readonly number[],
  offset = 0,
): boolean {
  if (bytes.byteLength < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/**
 * IMG-6: decides the image type from the file's first bytes, never from the
 * declared MIME type; null when the bytes match none of the accepted types.
 */
export function detectImageType(bytes: Uint8Array): DetectedImageType | null {
  if (startsWith(bytes, JPEG_SIGNATURE)) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }
  if (startsWith(bytes, PNG_SIGNATURE)) {
    return { mimeType: 'image/png', extension: 'png' };
  }
  if (
    startsWith(bytes, RIFF_SIGNATURE) &&
    startsWith(bytes, WEBP_SIGNATURE, WEBP_SIGNATURE_OFFSET)
  ) {
    return { mimeType: 'image/webp', extension: 'webp' };
  }
  return null;
}
