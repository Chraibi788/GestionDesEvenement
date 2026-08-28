import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_MODEL = "claude-sonnet-5";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 2;

let client: Anthropic | null = null;

export function isAiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function getAiModel() {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

/**
 * Lazily-constructed singleton Anthropic client. All Claude calls in this
 * app go through lib/ai/* services (never scattered across components),
 * which in turn call this — timeout and retry behavior is configured once,
 * here.
 */
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: MAX_RETRIES,
    });
  }
  return client;
}

export interface AiCallResult {
  text: string;
  model: string;
  durationMs: number;
}

/**
 * Sends a single-turn message to Claude and returns the raw text response.
 * Callers are responsible for parsing/validating the result (see
 * lib/ai/extract-rfq.ts and lib/ai/match-product.ts) — this layer only
 * owns transport concerns (auth, timeout, retry, error normalization).
 */
export async function callClaude(params: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<AiCallResult> {
  const anthropic = getClient();
  const model = getAiModel();
  const started = Date.now();

  const response = await anthropic.messages.create({
    model,
    max_tokens: params.maxTokens ?? 2048,
    system: params.system,
    messages: [{ role: "user", content: params.user }],
  });

  const durationMs = Date.now() - started;
  const textBlock = response.content.find((block) => block.type === "text");

  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude response did not contain a text block");
  }

  return { text: textBlock.text, model, durationMs };
}
