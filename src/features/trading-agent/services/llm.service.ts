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
const PLUS_TIMEOUT_MS = Number(process.env.LLM_PLUS_TIMEOUT_MS) || 15000; // 15s timeout for quality model
const FALLBACK_TO_CLOUD = process.env.LLM_FALLBACK === "true";

// Track whether we've detected slow responses — if so, permanently switch to fast model
let _modelPreference: "plus" | "fast" = "plus";

// OpenAI-compatible provider (works with hackathon endpoint, Ollama, or any compatible API)
function getProvider(baseUrl: string, apiKey: string) {
  return createOpenAICompatible({
    name: baseUrl.includes("hackathon") ? "bitgetops" : "openai",
    apiKey,
    baseURL: baseUrl,
  });
}

/** Send a chat completion using the configured endpoint */
export async function chatCompletion(options: {
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const baseUrl = BASE_URL;
  const apiKey = API_KEY;
  const provider = getProvider(baseUrl, apiKey);

  // Determine which model to use
  const targetModel = _modelPreference === "plus" ? MODEL_PLUS : MODEL_FAST;

  try {
    const systemMessage = options.messages.find(m => m.role === "system")?.content;
    const userMessages: Array<{ role: "user" | "assistant"; content: string }> =
      options.messages.filter((m): m is { role: string; content: string } & { role: "user" | "assistant" } => m.role !== "system");

    // Execute with timeout (only for the quality model)
    let result;
    if (_modelPreference === "plus" && PLUS_TIMEOUT_MS > 0) {
      try {
        result = await Promise.race([
          _generateWithProvider(provider, MODEL_PLUS, systemMessage, userMessages, options.temperature),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`LLM timeout after ${PLUS_TIMEOUT_MS}ms — switching to fast model`)), PLUS_TIMEOUT_MS)
          ),
        ]);
      } catch (timeoutErr) {
        if ((timeoutErr as Error).message.includes("timeout")) {
          console.log(`[LLM] ${MODEL_PLUS} too slow — permanently switching to ${MODEL_FAST}`);
          _modelPreference = "fast";
          // Retry with fast model
          result = await _generateWithProvider(provider, MODEL_FAST, systemMessage, userMessages, options.temperature);
        } else {
          throw timeoutErr;
        }
      }
    } else {
      result = await _generateWithProvider(provider, MODEL_FAST, systemMessage, userMessages, options.temperature);
    }

    return result.text;
  } catch (error) {
    console.error(`[LLM] ${baseUrl} (${targetModel}) failed:`, error instanceof Error ? error.message : String(error));

    // If the preferred model failed, try the alternative
    if (_modelPreference === "plus") {
      console.log(`[LLM] ${MODEL_PLUS} failed, trying ${MODEL_FAST}...`);
      try {
        const systemMessage = options.messages.find(m => m.role === "system")?.content;
        const userMessages: Array<{ role: "user" | "assistant"; content: string }> =
          options.messages.filter((m): m is { role: string; content: string } & { role: "user" | "assistant" } => m.role !== "system");
        const result = await _generateWithProvider(provider, MODEL_FAST, systemMessage, userMessages, options.temperature);
        return result.text;
      } catch (fastErr) {
        console.error(`[LLM] ${MODEL_FAST} also failed:`, fastErr instanceof Error ? fastErr.message : String(fastErr));
      }
    }

    // Fallback to OpenAI cloud if local failed and fallback enabled
    if (FALLBACK_TO_CLOUD && baseUrl.includes("localhost")) {
      console.log("[LLM] Local endpoint failed, trying OpenAI cloud...");
      try {
        const cloudProvider = getProvider("https://api.openai.com/v1", apiKey);
        const systemMessage = options.messages.find(m => m.role === "system")?.content;
        const userMessages: Array<{ role: "user" | "assistant"; content: string }> =
          options.messages.filter((m): m is { role: string; content: string } & { role: "user" | "assistant" } => m.role !== "system");
        const result = await _generateWithProvider(cloudProvider, MODEL_PLUS, systemMessage, userMessages, options.temperature);
        return result.text;
      } catch (cloudError) {
        console.error("[LLM] Cloud API also failed:", cloudError instanceof Error ? cloudError.message : String(cloudError));
      }
    }

    throw new Error(`LLM error: ${String(error)}`);
  }
}

async function _generateWithProvider(
  provider: any,
  model: string,
  systemMessage: string | undefined,
  userMessages: Array<{ role: "user" | "assistant"; content: string }>,
  temperature?: number,
) {
  return await generateText({
    model: provider(model),
    system: systemMessage || undefined,
    messages: userMessages,
    temperature: temperature ?? 0.3,
  });
}
