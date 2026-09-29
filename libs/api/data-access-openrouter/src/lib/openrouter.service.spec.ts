// SPEC §7 COOK-3/COOK-6/COOK-7/COOK-9 and §10 LOG-1..LOG-5: the single
// OpenRouter client. The network is mocked; no key, URL or payload here is real
// — the field names come from SPEC §7 (id, model, choices, usage).

import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { OpenRouterService } from './openrouter.service';
import type { PromptLogService } from './prompt-log.service';
import type { ChatInput, PromptLogEntry } from './openrouter.types';

/** SPEC §16 O6: the verified base URL, used when OPENROUTER_BASE_URL is unset. */
const VERIFIED_BASE_URL = 'https://openrouter.ai/api/v1';
/** COOK-3: the paid model id SPEC fixes. */
const SPEC_MODEL = 'minimax/minimax-m3';

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

interface PromptLogStub {
  service: PromptLogService;
  append: jest.Mock<Promise<void>, [PromptLogEntry]>;
}

function promptLogStub(): PromptLogStub {
  const append = jest.fn<Promise<void>, [PromptLogEntry]>(async () => undefined);
  return { service: { append } as unknown as PromptLogService, append };
}

function chatInput(overrides: Partial<ChatInput> = {}): ChatInput {
  return {
    feature: 'cook',
    userId: 'user-1',
    messages: [
      { role: 'system', content: 'You are a concise cooking assistant.' },
      { role: 'user', content: 'Give one useful tip for the current step' },
    ],
    maxTokens: 300,
    temperature: 0.4,
    ...overrides,
  };
}

/** SPEC §7: the OpenAI-compatible body OpenRouter returns. */
function completionBody() {
  return {
    id: 'gen-abc',
    model: SPEC_MODEL,
    choices: [{ message: { content: 'Salt the water before the pasta.' } }],
    usage: {
      prompt_tokens: 210,
      completion_tokens: 45,
      total_tokens: 255,
      cost: 0.00021,
    },
  };
}

function okResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('OpenRouterService', () => {
  let fetchMock: jest.Mock;
  let log: PromptLogStub;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    log = promptLogStub();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function service(values: Record<string, string>): OpenRouterService {
    return new OpenRouterService(configStub(values), log.service);
  }

  it('COOK-7 posts to `${base}/chat/completions` with the Bearer key and the model', async () => {
    fetchMock.mockResolvedValue(okResponse(completionBody()));

    await service({ OPENROUTER_KEY: 'test-key' }).chat(chatInput());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${VERIFIED_BASE_URL}/chat/completions`);
    expect(init.method).toBe('POST');
    expect(
      (init.headers as Record<string, string>)['Authorization'],
    ).toBe('Bearer test-key');
    expect(
      (init.headers as Record<string, string>)['Content-Type'],
    ).toBe('application/json');
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe(SPEC_MODEL);
    expect(body.messages).toEqual(chatInput().messages);
    expect(body.max_tokens).toBe(300);
    expect(body.temperature).toBe(0.4);
    expect(body.response_format).toBeUndefined();
  });

  it('COOK-3 sends the configured model and trims a trailing slash off the base URL', async () => {
    fetchMock.mockResolvedValue(okResponse(completionBody()));

    await service({
      OPENROUTER_KEY: 'test-key',
      OPENROUTER_BASE_URL: `${VERIFIED_BASE_URL}/`,
      OPENROUTER_MODEL: 'other/model',
    }).chat(chatInput());

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${VERIFIED_BASE_URL}/chat/completions`);
    expect(JSON.parse(String(init.body)).model).toBe('other/model');
  });

  it('WX-10 asks for a JSON object when responseFormatJson is set', async () => {
    fetchMock.mockResolvedValue(okResponse(completionBody()));

    await service({ OPENROUTER_KEY: 'test-key' }).chat(
      chatInput({ feature: 'recommend', responseFormatJson: true }),
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).response_format).toEqual({
      type: 'json_object',
    });
  });

  it('COOK-7 maps text, usage, cost, model and generation id from the response', async () => {
    fetchMock.mockResolvedValue(okResponse(completionBody()));

    const result = await service({ OPENROUTER_KEY: 'test-key' }).chat(
      chatInput(),
    );

    expect(result).toMatchObject({
      text: 'Salt the water before the pasta.',
      model: SPEC_MODEL,
      promptTokens: 210,
      completionTokens: 45,
      totalTokens: 255,
      cost: 0.00021,
      generationId: 'gen-abc',
    });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('COOK-7 reports the billed model from the response, not the requested one', async () => {
    fetchMock.mockResolvedValue(
      okResponse({ ...completionBody(), model: 'minimax/minimax-m3:batch' }),
    );

    const result = await service({
      OPENROUTER_KEY: 'test-key',
      OPENROUTER_MODEL: SPEC_MODEL,
    }).chat(chatInput());

    expect(result.model).toBe('minimax/minimax-m3:batch');
  });

  it('LOG-1/LOG-4 logs the successful call with the full prompt, response and cost', async () => {
    fetchMock.mockResolvedValue(okResponse(completionBody()));

    await service({ OPENROUTER_KEY: 'test-key' }).chat(chatInput());

    expect(log.append).toHaveBeenCalledTimes(1);
    const entry = log.append.mock.calls[0][0];
    expect(entry).toMatchObject({
      userId: 'user-1',
      feature: 'cook',
      modelRequested: SPEC_MODEL,
      modelUsed: SPEC_MODEL,
      prompt: chatInput().messages,
      response: 'Salt the water before the pasta.',
      promptTokens: 210,
      completionTokens: 45,
      cost: 0.00021,
      generationId: 'gen-abc',
    });
    expect(typeof entry.timestamp).toBe('string');
    expect(entry.error).toBeUndefined();
  });

  it('COOK-7 turns a non-2xx answer into ServiceUnavailableException', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => 'upstream provider error',
      json: async () => ({}),
    } as unknown as Response);

    await expect(
      service({ OPENROUTER_KEY: 'test-key' }).chat(chatInput()),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('LOG-5 logs a non-2xx answer with the status and no response text', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => 'upstream provider error',
      json: async () => ({}),
    } as unknown as Response);

    await expect(
      service({ OPENROUTER_KEY: 'test-key' }).chat(chatInput()),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(log.append).toHaveBeenCalledTimes(1);
    const entry = log.append.mock.calls[0][0];
    expect(entry.error?.status).toBe(502);
    expect(entry.error?.message).toContain('502');
    expect(entry.error?.message).toContain('upstream provider error');
    expect(entry.response).toBeUndefined();
    expect(entry.prompt).toEqual(chatInput().messages);
  });

  it('LOG-5 logs a network failure and answers ServiceUnavailableException', async () => {
    fetchMock.mockRejectedValue(new Error('socket hang up'));

    await expect(
      service({ OPENROUTER_KEY: 'test-key' }).chat(chatInput()),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    const entry = log.append.mock.calls[0][0];
    expect(entry.error?.message).toContain('socket hang up');
    expect(entry.error?.status).toBeUndefined();
  });

  it('COOK-6 refuses without a key and makes no request at all', async () => {
    await expect(service({}).chat(chatInput())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(log.append).toHaveBeenCalledTimes(1);
    expect(log.append.mock.calls[0][0].error?.message).toBe(
      'OpenRouter key is not configured',
    );
  });

  it('COOK-6 treats a blank key as unconfigured', async () => {
    await expect(
      service({ OPENROUTER_KEY: '   ' }).chat(chatInput()),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
