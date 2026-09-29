// SPEC §10 LOG-1..LOG-5: every AI call is appended to `<dir>/YYYY-MM-DD.json`
// (UTC date) as one JSON object per line. The directory here is always a fresh
// temp dir handed in through the config stub, never the repository `log/`.

import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PromptLogService } from './prompt-log.service';
import type { PromptLogEntry } from './openrouter.types';

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

function entry(overrides: Partial<PromptLogEntry> = {}): PromptLogEntry {
  return {
    timestamp: '2026-09-28T23:30:00.000Z',
    userId: 'user-1',
    feature: 'cook',
    modelRequested: 'minimax/minimax-m3',
    modelUsed: 'minimax/minimax-m3',
    prompt: [
      { role: 'system', content: 'You are a concise cooking assistant.' },
      { role: 'user', content: 'Step 2 of Lasagna' },
    ],
    response: 'Let the sauce reduce before layering.',
    promptTokens: 120,
    completionTokens: 40,
    cost: 0.00012,
    generationId: 'gen-1',
    latencyMs: 812,
    ...overrides,
  };
}

describe('PromptLogService', () => {
  let directory: string;
  let service: PromptLogService;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'rsn-prompt-log-'));
    service = new PromptLogService(
      configStub({ PROMPT_LOG_DIR: directory }),
    );
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('LOG-3 writes into the configured directory, not the process cwd', async () => {
    await service.append(entry());

    const written = await readFile(
      join(directory, '2026-09-28.json'),
      'utf8',
    );
    expect(written.length).toBeGreaterThan(0);
  });

  it('LOG-5 names the file after the UTC date of the entry', async () => {
    // 23:30 UTC is already the next day in Asia/Jerusalem; the UTC date wins.
    await service.append(entry({ timestamp: '2026-09-28T23:30:00.000Z' }));

    await expect(
      readFile(join(directory, '2026-09-28.json'), 'utf8'),
    ).resolves.toContain('"userId":"user-1"');
  });

  it('LOG-4/LOG-5 writes one JSON line holding the full prompt and response', async () => {
    const logged = entry();
    await service.append(logged);

    const written = await readFile(join(directory, '2026-09-28.json'), 'utf8');
    expect(written.endsWith('\n')).toBe(true);
    const lines = written.trimEnd().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual(logged);
  });

  it('LOG-5 appends a second entry as a second line of the same day file', async () => {
    await service.append(entry({ generationId: 'gen-1' }));
    await service.append(entry({ generationId: 'gen-2', feature: 'recommend' }));

    const lines = (await readFile(join(directory, '2026-09-28.json'), 'utf8'))
      .trimEnd()
      .split('\n');
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => JSON.parse(line).generationId)).toEqual([
      'gen-1',
      'gen-2',
    ]);
  });

  it('LOG-5 puts entries of two UTC dates in two files', async () => {
    await service.append(entry({ timestamp: '2026-09-28T23:59:59.000Z' }));
    await service.append(entry({ timestamp: '2026-09-29T00:00:01.000Z' }));

    await expect(
      readFile(join(directory, '2026-09-28.json'), 'utf8'),
    ).resolves.toContain('2026-09-28T23:59:59.000Z');
    await expect(
      readFile(join(directory, '2026-09-29.json'), 'utf8'),
    ).resolves.toContain('2026-09-29T00:00:01.000Z');
  });

  it('LOG-5 records a failed call with `error` and no `response`', async () => {
    const failed = entry({
      response: undefined,
      modelUsed: undefined,
      promptTokens: undefined,
      completionTokens: undefined,
      cost: undefined,
      generationId: undefined,
      error: { message: 'OpenRouter returned 502: bad gateway', status: 502 },
    });

    await service.append(failed);

    const line = (await readFile(join(directory, '2026-09-28.json'), 'utf8'))
      .trimEnd();
    const parsed = JSON.parse(line);
    expect(parsed.error).toEqual({
      message: 'OpenRouter returned 502: bad gateway',
      status: 502,
    });
    expect('response' in parsed).toBe(false);
  });

  it('LOG-5 logs the disk problem instead of throwing when the write fails', async () => {
    const blocked = join(directory, 'blocked');
    await writeFile(blocked, 'not a directory', 'utf8');
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await expect(
      new PromptLogService(configStub({ PROMPT_LOG_DIR: blocked })).append(
        entry(),
      ),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  describe('LOG-3 folder when PROMPT_LOG_DIR is unset (§14)', () => {
    // The fallback folder is `<cwd>/log`; cwd is stubbed to a temp dir so the
    // repository `log/` is never touched.
    let fakeRoot: string;

    beforeEach(async () => {
      fakeRoot = await mkdtemp(join(tmpdir(), 'rsn-prompt-log-root-'));
      jest.spyOn(process, 'cwd').mockReturnValue(fakeRoot);
    });

    afterEach(async () => {
      jest.restoreAllMocks();
      await rm(fakeRoot, { recursive: true, force: true });
    });

    it('LOG-3 writes under <cwd>/log when PROMPT_LOG_DIR is an empty string', async () => {
      await new PromptLogService(configStub({ PROMPT_LOG_DIR: '' })).append(
        entry(),
      );

      const written = await readFile(
        join(fakeRoot, 'log', '2026-09-28.json'),
        'utf8',
      );
      expect(JSON.parse(written.trimEnd())).toEqual(entry());
    });

    it('LOG-3 writes under <cwd>/log when PROMPT_LOG_DIR is only whitespace', async () => {
      await new PromptLogService(
        configStub({ PROMPT_LOG_DIR: '   \t ' }),
      ).append(entry());

      const written = await readFile(
        join(fakeRoot, 'log', '2026-09-28.json'),
        'utf8',
      );
      expect(JSON.parse(written.trimEnd())).toEqual(entry());
    });

    it('LOG-3 writes under <cwd>/log when PROMPT_LOG_DIR is undefined', async () => {
      await new PromptLogService(configStub({})).append(entry());

      const written = await readFile(
        join(fakeRoot, 'log', '2026-09-28.json'),
        'utf8',
      );
      expect(JSON.parse(written.trimEnd())).toEqual(entry());
    });

    it('LOG-3 uses a set PROMPT_LOG_DIR and writes nothing under <cwd>/log', async () => {
      const configured = join(fakeRoot, 'custom-log');

      await new PromptLogService(
        configStub({ PROMPT_LOG_DIR: configured }),
      ).append(entry());

      await expect(
        readFile(join(configured, '2026-09-28.json'), 'utf8'),
      ).resolves.toContain('"generationId":"gen-1"');
      await expect(
        readFile(join(fakeRoot, 'log', '2026-09-28.json'), 'utf8'),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    });
  });
});
