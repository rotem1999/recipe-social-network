/**
 * Types of the single OpenRouter client (SPEC §7 COOK-3/COOK-4/COOK-7/COOK-9)
 * and of the server-side prompt log (SPEC §10 LOG-1..LOG-5).
 */

/** The two features allowed to call the model (COOK-8 counts them together). */
export type ChatFeature = 'cook' | 'recommend';

/** One message of an OpenRouter chat request; COOK-9 keeps no history. */
export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

/**
 * The request's `reasoning` object (COOK-10, WX-10). §16 O14: `effort: "none"`
 * switches reasoning off; `minimax/minimax-m3` supports only on or off, so no
 * other effort level is offered here.
 */
export interface ChatReasoning {
  effort: 'none';
}

/** Input of {@link OpenRouterService.chat}. */
export interface ChatInput {
  feature: ChatFeature;
  userId: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
  /** Sent as the request's `reasoning` object when present (COOK-10, WX-10, §16 O14). */
  reasoning?: ChatReasoning;
  /** Ask the model for a JSON object (WX-10 expects `{"picks":[…]}`). */
  responseFormatJson?: boolean;
}

/** Result of one successful call; the numbers feed the log and the API responses (§7, §10). */
export interface ChatResult {
  text: string;
  /** The model actually used and billed (response `model` field, §7). */
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** `usage.cost` in OpenRouter credits, 1 credit = $1 (§7, LOG-5). */
  cost: number;
  generationId: string;
  latencyMs: number;
}

/** Failure record of a logged call (LOG-5). */
export interface PromptLogError {
  message: string;
  /** HTTP status of the OpenRouter response, absent for timeouts and configuration errors. */
  status?: number;
}

/** One JSON Lines entry of `log/YYYY-MM-DD.json` (LOG-2..LOG-5). */
export interface PromptLogEntry {
  timestamp: string;
  userId: string;
  feature: ChatFeature;
  modelRequested: string;
  modelUsed?: string;
  /** Full prompt messages (LOG-4). */
  prompt: ChatMessage[];
  /** Full response text (LOG-4); absent when the call failed. */
  response?: string;
  promptTokens?: number;
  completionTokens?: number;
  cost?: number;
  generationId?: string;
  latencyMs: number;
  /** Present instead of `response` when the call failed (LOG-5). */
  error?: PromptLogError;
}
