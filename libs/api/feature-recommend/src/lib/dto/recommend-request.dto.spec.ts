// SPEC §8 WX-9, WX-10 (BUG-026) and §11.5 UI-43: the `POST /recommend` body.
// Any zone the runtime's Intl knows is accepted (at most 64 characters); every
// other `timezone` is a 400 "Unknown time zone". The DTO runs through the
// ValidationPipe options apps/api/src/main.ts uses.
import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';

import {
  KnownTimeZoneConstraint,
  RecommendRequestDto,
} from './recommend-request.dto';

const pipe = new ValidationPipe({ whitelist: true, transform: true });
const metadata: ArgumentMetadata = {
  type: 'body',
  metatype: RecommendRequestDto,
  data: '',
};

function validate(body: unknown): Promise<RecommendRequestDto> {
  return pipe.transform(body, metadata) as Promise<RecommendRequestDto>;
}

/** The message list of a call that must fail with 400. */
async function messagesOf(promise: Promise<unknown>): Promise<string[]> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    const exception = error as BadRequestException;
    expect(exception.getStatus()).toBe(400);
    return (exception.getResponse() as { message: string[] }).message;
  }
  throw new Error('the call was expected to reject');
}

/** 65 characters: one over the WX-10 limit. */
const SIXTY_FIVE = `America/${'A'.repeat(57)}`;

describe('KnownTimeZoneConstraint', () => {
  const constraint = new KnownTimeZoneConstraint();

  it.each(['UTC', 'GMT', 'Etc/GMT+2', 'Etc/UTC', 'Asia/Jerusalem', 'America/New_York', 'America/Argentina/Buenos_Aires'])(
    'WX-9 accepts %s, a zone Intl knows',
    (timezone) => {
      expect(constraint.validate(timezone)).toBe(true);
    },
  );

  it.each([
    ['Foo/Bar', 'Foo/Bar'],
    ['an empty string', ''],
    ['65 characters', SIXTY_FIVE],
    ['Mars/Olympus_Mons', 'Mars/Olympus_Mons'],
  ])('WX-9 rejects %s', (_name, timezone) => {
    expect(constraint.validate(timezone)).toBe(false);
  });

  it.each([
    ['a number', 3],
    ['null', null],
    ['undefined', undefined],
    ['an array', ['UTC']],
  ])('WX-9 rejects %s', (_name, value) => {
    expect(constraint.validate(value)).toBe(false);
  });

  it('UI-43 names the problem "Unknown time zone"', () => {
    expect(constraint.defaultMessage()).toBe('Unknown time zone');
  });
});

describe('RecommendRequestDto', () => {
  it.each(['UTC', 'GMT', 'Etc/GMT+2', 'Asia/Jerusalem'])(
    'WX-9 accepts the timezone %s',
    async (timezone) => {
      const dto = await validate({ timezone, scope: 'home' });

      expect(dto).toBeInstanceOf(RecommendRequestDto);
      expect(dto.timezone).toBe(timezone);
    },
  );

  it('WX-10 accepts a zone of exactly 64 characters when Intl knows it', async () => {
    // No IANA zone is 64 characters long, so the limit is checked alone here.
    const sixtyFour = `America/${'A'.repeat(56)}`;
    expect(sixtyFour).toHaveLength(64);

    const messages = await messagesOf(
      validate({ timezone: sixtyFour, scope: 'home' }),
    );

    // Rejected only because Intl does not know it, never for its length.
    expect(messages).toEqual(['Unknown time zone']);
  });

  it.each([
    ['Foo/Bar', 'Foo/Bar'],
    ['an empty string', ''],
    ['65 characters', SIXTY_FIVE],
    ['a number', 42],
  ])(
    'WX-9, UI-43 answers 400 "Unknown time zone" for %s',
    async (_name, timezone) => {
      const messages = await messagesOf(validate({ timezone, scope: 'home' }));

      expect(messages.length).toBeGreaterThan(0);
      for (const message of messages) {
        expect(message).toBe('Unknown time zone');
      }
    },
  );

  it('WX-10 answers 400 "Unknown time zone" for a missing timezone', async () => {
    const messages = await messagesOf(validate({ scope: 'home' }));

    expect(messages).toContain('Unknown time zone');
  });

  it('UI-43 names an unknown scope for people', async () => {
    const messages = await messagesOf(
      validate({ timezone: 'UTC', scope: 'everywhere' }),
    );

    expect(messages).toEqual(['Recommendations are for Home or Discover']);
  });

  it('WX-5 accepts a list of recipe ids to skip', async () => {
    const dto = await validate({
      timezone: 'Asia/Jerusalem',
      scope: 'discover',
      excludeRecipeIds: ['8f14e45f-ceea-4e7a-8f4b-9a6c5d3e2b1a'],
    });

    expect(dto.excludeRecipeIds).toEqual([
      '8f14e45f-ceea-4e7a-8f4b-9a6c5d3e2b1a',
    ]);
  });

  it('UI-43 names a skip list that is not a list for people', async () => {
    const messages = await messagesOf(
      validate({ timezone: 'UTC', scope: 'home', excludeRecipeIds: 'abc' }),
    );

    expect(messages).toContain('The recipes to skip must be a list');
  });

  it('UI-43 names a skip entry that is not a recipe id for people', async () => {
    const messages = await messagesOf(
      validate({ timezone: 'UTC', scope: 'home', excludeRecipeIds: ['abc'] }),
    );

    expect(messages).toEqual(['Every recipe to skip must be a recipe id']);
  });
});
