import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PromptLogService } from './prompt-log.service';
import type {
  ChatInput,
  ChatResult,
  PromptLogEntry,
  PromptLogError,
} from './openrouter.types';

/** COOK-3: the paid model id; `minimax/minimax-m3:free` has no serving endpoint (§16 O1/O3). */
const DEFAULT_MODEL = 'minimax/minimax-m3';
/** §16 O6: verified OpenRouter base URL. */
const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
/** §16 O6: app-identifying headers OpenRouter documents for the chat endpoint. */
const APP_TITLE = 'CookBook';
const APP_REFERER = 'https://cookbook.local';
/** One request per question (COOK-9); a minute is far beyond any normal answer. */
const REQUEST_TIMEOUT_MS = 60_000;
/** Enough of an error body to diagnose, short enough for one log line. */
const ERROR_BODY_EXCERPT = 200;
/**
 * §11.6: the only message a client sees when a call fails; the provider's status and
 * body excerpt stay in the LOG-5 `error` entry and the API log (SEC-004).
 */
export const ASSISTANT_UNAVAILABLE_MESSAGE =
  'The assistant is unavailable right now';

/** Shape of the OpenAI-compatible response OpenRouter returns (§7, §16 O7/O8). */
interface ChatCompletionResponse {
  id?: string;
  model?: string;
  choices?: { message?: { content?: string | null } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
  };
}

/**
 * COOK-6/COOK-7: the single OpenRouter client. It is the only place the key and
 * the provider URL appear, and every call it makes is logged (§10).
 * The daily quota (COOK-8) is checked by the calling feature, not here.
 */
@Injectable()
export class OpenRouterService {
  private readonly logger = new Logger(OpenRouterService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly promptLog: PromptLogService,
  ) {}

  /** COOK-4/COOK-9: one stateless request carrying the whole engineered prompt. */
  async chat(input: ChatInput): Promise<ChatResult> {
    const model = this.config.get<string>('OPENROUTER_MODEL') ?? DEFAULT_MODEL;
    const baseUrl =
      this.config.get<string>('OPENROUTER_BASE_URL') ?? DEFAULT_BASE_URL;
    const key = this.config.get<string>('OPENROUTER_KEY');
    const startedAt = Date.now();

    if (key === undefined || key.trim() === '') {
      throw await this.fail(input, model, startedAt, {
        message: 'OpenRouter key is not configured',
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${trimTrailingSlash(baseUrl)}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': APP_REFERER,
          'X-Title': APP_TITLE,
        },
        body: JSON.stringify({
          model,
          messages: input.messages,
          max_tokens: input.maxTokens,
          temperature: input.temperature,
          ...(input.responseFormatJson === true
            ? { response_format: { type: 'json_object' } }
            : {}),
        }),
      });
    } catch (cause) {
      const message =
        cause instanceof Error && cause.name === 'AbortError'
          ? `OpenRouter did not answer within ${REQUEST_TIMEOUT_MS / 1000} s`
          : `OpenRouter request failed: ${
              cause instanceof Error ? cause.message : String(cause)
            }`;
      throw await this.fail(input, model, startedAt, { message });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const message = `OpenRouter returned ${response.status}: ${excerpt(
        await readBody(response),
      )}`;
      throw await this.fail(input, model, startedAt, {
        message,
        status: response.status,
      });
    }

    let payload: ChatCompletionResponse;
    try {
      payload = (await response.json()) as ChatCompletionResponse;
    } catch (cause) {
      const message = `OpenRouter returned an unreadable body: ${
        cause instanceof Error ? cause.message : String(cause)
      }`;
      throw await this.fail(input, model, startedAt, {
        message,
        status: response.status,
      });
    }

    // §7: the response carries the billed model, the generation id and `usage`.
    const result: ChatResult = {
      text: payload.choices?.[0]?.message?.content ?? '',
      model: payload.model ?? model,
      promptTokens: payload.usage?.prompt_tokens ?? 0,
      completionTokens: payload.usage?.completion_tokens ?? 0,
      totalTokens: payload.usage?.total_tokens ?? 0,
      cost: payload.usage?.cost ?? 0,
      generationId: payload.id ?? '',
      latencyMs: Date.now() - startedAt,
    };

    // LOG-1/LOG-4: full prompt and full response text.
    await this.promptLog.append({
      timestamp: new Date().toISOString(),
      userId: input.userId,
      feature: input.feature,
      modelRequested: model,
      modelUsed: result.model,
      prompt: input.messages,
      response: result.text,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      cost: result.cost,
      generationId: result.generationId,
      latencyMs: result.latencyMs,
    });

    return result;
  }

  /**
   * LOG-5: failures are logged too, with `error` instead of the response, and go to the
   * API log. §11.6 (SEC-004): the returned 503 carries only the neutral message, never
   * the provider's status or body.
   */
  private async fail(
    input: ChatInput,
    modelRequested: string,
    startedAt: number,
    error: PromptLogError,
  ): Promise<ServiceUnavailableException> {
    this.logger.error(
      `OpenRouter call for "${input.feature}" failed: ${error.message}`,
    );
    const entry: PromptLogEntry = {
      timestamp: new Date().toISOString(),
      userId: input.userId,
      feature: input.feature,
      modelRequested,
      prompt: input.messages,
      latencyMs: Date.now() - startedAt,
      error,
    };
    await this.promptLog.append(entry);
    return new ServiceUnavailableException(ASSISTANT_UNAVAILABLE_MESSAGE);
  }
}

function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

async function readBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function excerpt(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > ERROR_BODY_EXCERPT
    ? `${flat.slice(0, ERROR_BODY_EXCERPT)}…`
    : flat;
}
