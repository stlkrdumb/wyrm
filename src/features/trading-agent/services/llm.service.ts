import dotenv from "dotenv";
import path from "node:path";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";

// Load .env.local with override to ensure fresh values (no module cache issues)
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

const BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const API_KEY = process.env.OPENAI_API_KEY || "";
const MODEL_PLUS = process.env.LLM_MODEL || "qwen3.6-plus";
const MODEL_FAST = process.env.LLM_MODEL_FAST || "qwen3.6-flash";
const PLUS_TIMEOUT_MS = Number(process.env.LLM_PLUS_TIMEOUT_MS) || 45000; // 45s for quality model (local LLM hardware)
const FAST_TIMEOUT_MS = Number(process.env.LLM_FAST_TIMEOUT_MS) || 27000; // 27s for fast model (local LLM hardware)
const FALLBACK_TO_CLOUD = process.env.LLM_FALLBACK === "true";

// Track whether we've detected slow responses on local hardware — if so, permanently switch to fast model
let _modelPreference: "plus" | "fast" = "plus";

/** Returns the model name currently being used */
export function getActiveModel(): string {
  return _modelPreference === "plus" ? MODEL_PLUS : MODEL_FAST;
}

// OpenAI-compatible provider (works with Ollama or any compatible API)
function getProvider(baseUrl: string, apiKey: string) {
  return createOpenAICompatible({
    name: baseUrl.includes("hackathon") ? "bitgetops" : "openai",
    apiKey,
    baseURL: baseUrl,
  });
}

/** Callback fired with the full response (for streaming progress UI — emits once with complete text) */
type TokenCallback = (token: string, cumulative: string) => void;

/** Send a chat completion using the configured endpoint */
export async function chatCompletion(options: {
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  onToken?: TokenCallback;
}): Promise<string> {
  const baseUrl = BASE_URL;
  const apiKey = API_KEY;
  const provider = getProvider(baseUrl, apiKey);

  // Determine which model to use
  const targetModel = _modelPreference === "plus" ? MODEL_PLUS : MODEL_FAST;

  try {
    let result: string;

    if (_modelPreference === "plus") {
      try {
        // Attempt with quality model + timeout guard
        result = await _generateWithProviderWithTimeout(
          provider, MODEL_PLUS, options.messages, options.temperature, options.maxTokens, options.onToken
        );
      } catch (timeoutErr) {
        if ((timeoutErr as Error).message.includes("timeout")) {
          console.log(`[LLM] ${MODEL_PLUS} too slow on local hardware — permanently switching to ${MODEL_FAST}`);
          _modelPreference = "fast";
          result = await _generateWithProviderWith429Retry(
            provider, MODEL_FAST, options.messages, options.temperature, options.maxTokens, options.onToken
          );
        } else {
          throw timeoutErr;
        }
      }
    } else {
      result = await _generateWithProviderWith429Retry(
        provider, MODEL_FAST, options.messages, options.temperature, options.maxTokens, options.onToken
      );
    }

    return result;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[LLM] ${baseUrl} (${targetModel}) failed:`, errMsg);

    // If "plus" is preferred and already downgraded to "fast", no alternate to try
    if (_modelPreference !== "plus") {
      throw new Error(`LLM error: ${errMsg}`);
    }

    console.log(`[LLM] ${MODEL_PLUS} failed, trying ${MODEL_FAST}...`);
    try {
      const result = await _generateWithProviderWith429Retry(
        provider, MODEL_FAST, options.messages, options.temperature, options.maxTokens, options.onToken
      );
    if (result.trim().length === 0) {
      console.warn(`[LLM] ${targetModel} returned empty response — model may be unresponsive or prompt too long`);
    }
    return result;
    } catch (fastErr) {
      console.error(`[LLM] ${MODEL_FAST} also failed:`, fastErr instanceof Error ? fastErr.message : String(fastErr));
    }

    // Fallback to cloud if local failed and fallback enabled
    if (FALLBACK_TO_CLOUD && baseUrl.includes("localhost")) {
      console.log("[LLM] Local endpoint failed, trying OpenAI cloud...");
      try {
        const cloudProvider = getProvider("https://api.openai.com/v1", apiKey);
        await _generateWithProviderWith429Retry(
          cloudProvider, MODEL_PLUS, options.messages, options.temperature, options.maxTokens, options.onToken
        );
      } catch (cloudError) {
        console.error("[LLM] Cloud API also failed:", cloudError instanceof Error ? cloudError.message : String(cloudError));
      }
    }

    throw new Error(`LLM error: ${errMsg}`);
  }
}

/** Extract system message from messages array and return { system, messages } */
function splitMessages(
  messages: Array<{ role: string; content: string }>
): { system: string | undefined; userMessages: Array<{ role: string; content: string }> } {
  const sys = messages.find(m => m.role === "system")?.content;
  const userMessages = messages.filter(m => m.role !== "system");
  return { system: sys, userMessages };
}

/** Generate text via generateText with a timeout guard for local LLM hardware */
async function _generateWithProviderWithTimeout(
  provider: any,
  model: string,
  messages: Array<{ role: string; content: string }>,
  temperature?: number,
  maxTokens?: number,
  onToken?: TokenCallback,
): Promise<string> {
  const timeoutMs = _modelPreference === "plus" ? PLUS_TIMEOUT_MS : FAST_TIMEOUT_MS;
  const { system, userMessages } = splitMessages(messages);

  return await Promise.race([
    generateText({
      model: provider(model),
      system,
      messages: userMessages as any, // cast needed for ai SDK strict typing
      temperature: temperature ?? 0.3,
      maxOutputTokens: maxTokens ?? 4096,
    }).then(({ text }) => {
      if (onToken) onToken(text, text);
      return text;
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`LLM timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

/** Wrapper around generateText (no timeout — called for fast model or inside retry) */
async function _generateWithProvider(
  provider: any,
  model: string,
  messages: Array<{ role: string; content: string }>,
  temperature?: number,
  maxTokens?: number,
  onToken?: TokenCallback,
): Promise<string> {
  const { system, userMessages } = splitMessages(messages);

  const { text } = await generateText({
    model: provider(model),
    system,
    messages: userMessages as any, // cast needed for ai SDK strict typing
    temperature: temperature ?? 0.3,
    maxOutputTokens: maxTokens ?? 4096,
  });

  if (!text || text.trim().length === 0) {
    console.warn(`[LLM] ${model} returned empty text (${messages.length} messages, ${messages.reduce((s, m) => s + m.content.length, 0)} chars total)`);
  }

  if (onToken) onToken(text, text);

  return text;
}

/** Wrapper around generateText with 429 retry + exponential backoff */
async function _generateWithProviderWith429Retry(
  provider: any,
  model: string,
  messages: Array<{ role: string; content: string }>,
  temperature?: number,
  maxTokens?: number,
  onToken?: TokenCallback | undefined,
  maxRetries: number = 3,
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await _generateWithProvider(provider, model, messages, temperature, maxTokens, onToken);
    } catch (err) {
      const errStr = err instanceof Error ? err.message : String(err);

      // Only retry on 429 rate limit errors
      if (!errStr.includes("429") && !errStr.includes("Too many requests")) {
        throw err;
      }

      lastError = new Error(errStr);
      const delayMs = attempt < maxRetries ? Math.min(1000 * Math.pow(2, attempt), 10_000) : 0;

      if (attempt < maxRetries && delayMs > 0) {
        console.warn(`[LLM] got 429 on attempt ${attempt + 1}/${maxRetries + 1}, retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else if (attempt === maxRetries) {
        console.error(`[LLM] failed after ${maxRetries} retries due to rate limit: ${errStr}`);
      }
    }
  }

  throw lastError!;
}
