// SPEC §6 COM-3: a comment body is 1-2000 characters after trimming surrounding whitespace.
// The DTO is run through the same global ValidationPipe options apps/api/src/main.ts uses.
import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';
import { COMMENT_MAX_LENGTH } from '@rsn/shared/util-domain';
import { CommentRequestDto } from './comment.dto';

const pipe = new ValidationPipe({ whitelist: true, transform: true });
const metadata: ArgumentMetadata = {
  type: 'body',
  metatype: CommentRequestDto,
  data: '',
};

function validate(body: unknown): Promise<CommentRequestDto> {
  return pipe.transform(body, metadata) as Promise<CommentRequestDto>;
}

/** Narrows the rejection of a call that must fail, so its status can be asserted. */
async function failureOf(promise: Promise<unknown>): Promise<BadRequestException> {
  try {
    await promise;
  } catch (error) {
    return error as BadRequestException;
  }
  throw new Error('the call was expected to reject');
}

describe('CommentRequestDto', () => {
  it('COM-3 limits a comment to 2000 characters', () => {
    expect(COMMENT_MAX_LENGTH).toBe(2000);
  });

  it('COM-3 hands the controller the body with surrounding whitespace trimmed', async () => {
    const dto = await validate({ body: '  \n\tTasty!  \n' });

    expect(dto).toBeInstanceOf(CommentRequestDto);
    expect(dto.body).toBe('Tasty!');
  });

  it('COM-3 keeps whitespace inside the body', async () => {
    const dto = await validate({ body: ' Great  soup,\nthanks ' });

    expect(dto.body).toBe('Great  soup,\nthanks');
  });

  it.each([
    ['spaces', '   '],
    ['a newline and tabs', '\n\t \t\n'],
    ['non-breaking and ideographic spaces', ' 　'],
  ])('COM-3 rejects a whitespace-only comment (%s) with 400', async (_name, body) => {
    const error = await failureOf(validate({ body }));

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getStatus()).toBe(400);
  });

  it('COM-3 rejects an empty comment with 400', async () => {
    const error = await failureOf(validate({ body: '' }));

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getStatus()).toBe(400);
  });

  it('COM-3 accepts a 1-character and a 2000-character comment', async () => {
    await expect(validate({ body: 'a' })).resolves.toEqual(
      expect.objectContaining({ body: 'a' }),
    );
    const longest = 'x'.repeat(COMMENT_MAX_LENGTH);
    await expect(validate({ body: longest })).resolves.toEqual(
      expect.objectContaining({ body: longest }),
    );
  });

  it('COM-3 rejects a 2001-character comment with 400', async () => {
    const error = await failureOf(
      validate({ body: 'x'.repeat(COMMENT_MAX_LENGTH + 1) }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getStatus()).toBe(400);
  });

  it('COM-3 counts the length after trimming, so padding around 2000 characters is accepted', async () => {
    const longest = 'x'.repeat(COMMENT_MAX_LENGTH);

    const dto = await validate({ body: `   ${longest}\n\n` });

    expect(dto.body).toBe(longest);
  });

  it('COM-3 rejects 2001 characters even when surrounded by whitespace', async () => {
    const error = await failureOf(
      validate({ body: `  ${'x'.repeat(COMMENT_MAX_LENGTH + 1)}  ` }),
    );

    expect(error.getStatus()).toBe(400);
  });

  it.each([
    ['a number', 42],
    ['null', null],
    ['an array', ['hello']],
  ])('COM-3 rejects a body that is %s with 400', async (_name, body) => {
    const error = await failureOf(validate({ body }));

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getStatus()).toBe(400);
  });

  it('COM-3 rejects a request without a body field with 400', async () => {
    const error = await failureOf(validate({}));

    expect(error.getStatus()).toBe(400);
  });

  /** The 400's message list. */
  function messagesOf(error: BadRequestException): string[] {
    return (error.getResponse() as { message: string[] }).message;
  }

  it.each([
    ['empty', ''],
    ['whitespace only', '  \n\t '],
  ])('UI-43 answers an %s comment with "Write a comment"', async (_name, body) => {
    const error = await failureOf(validate({ body }));

    expect(messagesOf(error)).toEqual(['Write a comment']);
  });

  it('UI-43 answers a comment that is not text with "Write a comment"', async () => {
    const error = await failureOf(validate({ body: 42 }));

    expect(messagesOf(error)).toContain('Write a comment');
    for (const message of messagesOf(error)) {
      expect(message).not.toMatch(/^body /);
    }
  });

  it('UI-43 answers a 2001-character comment with "Comments can be at most 2000 characters"', async () => {
    const error = await failureOf(
      validate({ body: 'x'.repeat(COMMENT_MAX_LENGTH + 1) }),
    );

    expect(messagesOf(error)).toEqual([
      'Comments can be at most 2000 characters',
    ]);
  });
});
