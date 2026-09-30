// SPEC.md UI-45 (step text, comment bodies and AI answers keep their line
// breaks through `text-pre-line`), UI-15 (the cook-mode question box is as wide
// as the answer box and grows from JS), UI-38 / UI-50 (the SAVE-9 source link is
// inline in its line and never centred) and UI-50 (a clamped right-to-left title
// keeps its "…"). Vitest blanks CSS imports, `?raw` included, so the checked-in
// stylesheet is read directly and read-only, as dialog.spec.tsx does for UI-42.
// Layout itself (where Chromium draws the ellipsis) is not observable in jsdom;
// these tests pin the declarations the SPEC rows rely on.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const tokensCss = readFileSync(
  resolve(import.meta.dirname, './tokens.css'),
  'utf8',
);

/** The declarations of the stand-alone rule for `selector`, as a property map. */
function rule(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(
    tokensCss,
  );
  if (match === null) {
    throw new Error(`no rule for ${selector} in tokens.css`);
  }
  const declarations: Record<string, string> = {};
  for (const line of match[1].replace(/\/\*[\s\S]*?\*\//g, '').split(';')) {
    const colon = line.indexOf(':');
    if (colon > 0) {
      declarations[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
  }
  return declarations;
}

describe('tokens.css', () => {
  it('UI-45 gives text-pre-line white-space: pre-line', () => {
    expect(rule('.text-pre-line')['white-space']).toBe('pre-line');
  });

  it('UI-15 makes the cook question box as wide as the answer box', () => {
    const question = rule('.cook-question')['max-width'];
    expect(question).toBeDefined();
    expect(question).toBe(rule('.cook-answer')['max-width']);
  });

  it('UI-15 UI-45 lets a growing textarea take its height from JS: no minimum, no resize handle, no scrollbar', () => {
    const grow = rule('textarea.input.textarea-grow');
    expect(grow['min-height']).toBe('0');
    expect(grow['resize']).toBe('none');
    expect(grow['overflow-y']).toBe('hidden');
  });

  it('UI-38 UI-50 lays the SAVE-9 source link out inline and aligned with its line', () => {
    const link = rule('.link-button');
    expect(link['display']).toBe('inline');
    expect(link['text-align']).toBe('inherit');
    expect(link['font']).toBe('inherit');
  });

  it('UI-38 underlines the source link on hover only', () => {
    expect(rule('.link-button')['text-decoration']).toBe('none');
    expect(rule('.link-button:hover')['text-decoration']).toBe('underline');
  });

  it('UI-50 keeps clamped titles left-aligned and bidi text in its own direction', () => {
    expect(rule('.bidi-text')['unicode-bidi']).toBe('plaintext');
    expect(rule('.bidi-text')['text-align']).toBe('start');
    expect(rule('.bidi-text.card-clamp')['text-align']).toBe('left');
  });

  it('UI-50 gives a right-to-left clamped title room for its "…" without moving its text', () => {
    const rtl = rule('.bidi-text.card-clamp:dir(rtl)');
    expect(rtl['padding-left']).toBeDefined();
    // The padding and the pull-back margin cancel, so the text stays aligned.
    expect(rtl['margin-left']).toBe(`-${rtl['padding-left']}`);
  });
});
