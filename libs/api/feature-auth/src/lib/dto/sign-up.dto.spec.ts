// SPEC §2 AUTH-5 and §11.5 UI-43: the `POST /auth/sign-up` body. Every 400
// carries the sentence the sign-up form shows (UI-9), never a class-validator
// default. The DTO runs through the ValidationPipe options apps/api/src/main.ts uses.
import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@rsn/shared/util-domain';

import { SignUpDto } from './sign-up.dto';

const pipe = new ValidationPipe({ whitelist: true, transform: true });
const metadata: ArgumentMetadata = { type: 'body', metatype: SignUpDto, data: '' };

const USERNAME_MESSAGE =
  'Use 3 to 32 characters: letters, numbers, underscore, dot or hyphen.';
const EMAIL_MESSAGE = 'Enter an email address like you@example.com.';

function validate(body: unknown): Promise<SignUpDto> {
  return pipe.transform(body, metadata) as Promise<SignUpDto>;
}

/** The message list of a call that must fail with 400. */
async function messagesOf(body: unknown): Promise<string[]> {
  try {
    await validate(body);
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    const exception = error as BadRequestException;
    expect(exception.getStatus()).toBe(400);
    return (exception.getResponse() as { message: string[] }).message;
  }
  throw new Error('the call was expected to reject');
}

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { username: 'rotem', password: 'correct-horse', ...overrides };
}

describe('SignUpDto', () => {
  it('AUTH-5 accepts a valid username and password, lower-casing and trimming the username', async () => {
    const dto = await validate(body({ username: '  Rotem.K  ' }));

    expect(dto).toBeInstanceOf(SignUpDto);
    expect(dto.username).toBe('rotem.k');
  });

  it('AUTH-5 accepts an email and lower-cases it', async () => {
    const dto = await validate(body({ email: ' You@Example.com ' }));

    expect(dto.email).toBe('you@example.com');
  });

  it.each([
    ['too short', 'ro'],
    ['too long', 'r'.repeat(33)],
    ['a space inside', 'ro tem'],
    ['a symbol outside the set', 'rotem!'],
  ])('UI-43 answers a username that is %s with the sign-up form sentence', async (_name, username) => {
    expect(await messagesOf(body({ username }))).toEqual([USERNAME_MESSAGE]);
  });

  it('UI-43 answers a username that is not text with the sign-up form sentence', async () => {
    const messages = await messagesOf(body({ username: 42 }));

    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      expect(message).toBe(USERNAME_MESSAGE);
    }
  });

  it(`UI-43 answers a password under ${PASSWORD_MIN_LENGTH} characters with "Use at least 8 characters."`, async () => {
    expect(
      await messagesOf(body({ password: 'p'.repeat(PASSWORD_MIN_LENGTH - 1) })),
    ).toEqual(['Use at least 8 characters.']);
  });

  it(`UI-43 answers a password over ${PASSWORD_MAX_LENGTH} characters with "Use at most 128 characters."`, async () => {
    expect(
      await messagesOf(body({ password: 'p'.repeat(PASSWORD_MAX_LENGTH + 1) })),
    ).toEqual(['Use at most 128 characters.']);
  });

  it('UI-43 answers a missing password with "Enter a password"', async () => {
    const messages = await messagesOf({ username: 'rotem' });

    expect(messages).toContain('Enter a password');
  });

  it('UI-43 answers a malformed email with the sign-up form sentence', async () => {
    expect(await messagesOf(body({ email: 'not-an-email' }))).toEqual([
      EMAIL_MESSAGE,
    ]);
  });

  it('UI-43 never sends a class-validator default text or a field name', async () => {
    const messages = await messagesOf({ username: '!', password: 'x', email: 'y' });

    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      expect(message).not.toMatch(/^(username|password|email) /);
      expect(message).not.toMatch(/must be|must match|longer than or equal/);
    }
  });
});
