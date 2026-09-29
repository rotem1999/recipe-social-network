// SPEC §8 WX-10: the recommendation answer must be read out of a possibly
// chatty model reply; a non-JSON answer yields null so the caller shows none.

import { extractJsonObject } from './extract-json-object';

describe('extractJsonObject', () => {
  it('WX-10 parses a bare JSON object answer', () => {
    expect(extractJsonObject('{"picks":[{"id":"r1","reason":"warm"}]}')).toEqual(
      { picks: [{ id: 'r1', reason: 'warm' }] },
    );
  });

  it('WX-10 parses the first {…} block out of prose and a code fence', () => {
    const answer = [
      'Here is my pick for a cold night:',
      '```json',
      '{"picks":[{"id":"r2","reason":"hot soup"}]}',
      '```',
      'Enjoy!',
    ].join('\n');

    expect(extractJsonObject(answer)).toEqual({
      picks: [{ id: 'r2', reason: 'hot soup' }],
    });
  });

  it('WX-10 returns the first object when the text holds two of them', () => {
    expect(extractJsonObject('{"picks":[]} and then {"picks":[{"id":"r3"}]}'))
      .toEqual({ picks: [] });
  });

  it('WX-10 keeps nested objects inside the first block', () => {
    expect(
      extractJsonObject('answer: {"picks":[{"id":"r4","meta":{"rank":1}}]}'),
    ).toEqual({ picks: [{ id: 'r4', meta: { rank: 1 } }] });
  });

  it('WX-10 ignores braces inside strings and escaped quotes', () => {
    expect(
      extractJsonObject('{"picks":[{"id":"r5","reason":"a \\"{\\" brace"}]}'),
    ).toEqual({ picks: [{ id: 'r5', reason: 'a "{" brace' }] });
  });

  it('WX-10 returns null for an answer with no object at all', () => {
    expect(extractJsonObject('I cannot recommend anything right now.')).toBe(
      null,
    );
  });

  it('WX-10 returns null for an unbalanced object', () => {
    expect(extractJsonObject('{"picks":[{"id":"r6"}]')).toBe(null);
  });

  it('WX-10 returns null when the first block is not valid JSON', () => {
    expect(extractJsonObject("{picks: 'r7'}")).toBe(null);
  });

  it('WX-10 returns null for an empty answer', () => {
    expect(extractJsonObject('')).toBe(null);
  });
});
