// SPEC.md UI-25 (the editor leaves the upload notice for the detail screen,
// shown once) and UI-47 (the notice counts in words: "1 image could not be
// uploaded", "2 images could not be uploaded").
import {
  clearUploadNotice,
  peekUploadNotice,
  setUploadNotice,
  uploadNoticeText,
} from './upload-notice';

describe('upload-notice', () => {
  afterEach(() => {
    clearUploadNotice('r1');
    clearUploadNotice('r2');
  });

  it('UI-47 says "1 image could not be uploaded" for one failure', () => {
    expect(uploadNoticeText(1, 'Images must be 5 MB or smaller.')).toBe(
      'The recipe was saved, but 1 image could not be uploaded: Images must be 5 MB or smaller.',
    );
  });

  it('UI-47 says "2 images could not be uploaded" for two failures', () => {
    expect(uploadNoticeText(2, 'Image storage is unavailable right now')).toBe(
      'The recipe was saved, but 2 images could not be uploaded: Image storage is unavailable right now',
    );
  });

  it('UI-25 keeps a notice per recipe id until it is cleared', () => {
    setUploadNotice('r1', 'first');
    setUploadNotice('r2', 'second');

    expect(peekUploadNotice('r1')).toBe('first');
    expect(peekUploadNotice('r1')).toBe('first');
    expect(peekUploadNotice('r2')).toBe('second');

    clearUploadNotice('r1');

    expect(peekUploadNotice('r1')).toBeNull();
    expect(peekUploadNotice('r2')).toBe('second');
  });

  it('UI-25 has no notice for a recipe the editor left none for', () => {
    expect(peekUploadNotice('r3')).toBeNull();
  });
});
