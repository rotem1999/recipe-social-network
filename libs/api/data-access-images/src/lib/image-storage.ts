/**
 * IMG-3, IMG-4, IMG-6: the contract the API uses to store recipe images in
 * Cloud Storage for Firebase and to hand out short-lived read URLs.
 */

/** IMG-3: one image upload coming from `POST /recipes/:id/images`. */
export interface ImageUploadInput {
  /** Recipe the image belongs to; first segment of the object path. */
  recipeId: string;
  /** Raw bytes of the image. */
  buffer: Buffer;
  /** Declared MIME type; must be one of IMAGE_MIME_TYPES (IMG-6). */
  mimeType: string;
  /** Original file name, kept only for logging; never used in the object path. */
  originalName?: string;
}

/** IMG-2: the only way the rest of the API reaches the Firebase bucket. */
export interface ImageStorage {
  /** IMG-6: false when the FIREBASE_* keys are empty. */
  isConfigured(): boolean;
  /** IMG-3: writes the bytes and returns the object path `recipes/<recipeId>/<uuid>.<ext>`. */
  upload(input: ImageUploadInput): Promise<string>;
  /** Deletes one object; a missing object is not an error. */
  remove(objectPath: string): Promise<void>;
  /** IMG-4: one read signed URL per path, in the same order. */
  signedUrls(objectPaths: string[]): Promise<string[]>;
}
