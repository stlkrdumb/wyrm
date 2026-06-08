import dotenv from "dotenv";
import path from "node:path";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";

// Load .env.local with override to ensure fresh values (no module cache issues)
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

const BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const API_KEY = process.env.OPENAI_API_KEY || "";
const MODEL = process.env.LLM_MODEL || "qwen3.6-plus";
const FALLBACK_TO_CLOUD = process.env.LLM_FALLBACK === "true";

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

  // Build provider for configured endpoint
  const provider = getProvider(baseUrl, apiKey);

  try {
    // Extract system message if present
    const systemMessage = options.messages.find(m => m.role === "system")?.content;
    const userMessages = options.messages.filter(m => m.role !== "system");

    const result = await generateText({
      model: provider(MODEL),
      system: systemMessage || undefined,
      messages: userMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      temperature: options.temperature ?? 0.3,
    });

    return result.text;
  } catch (error) {
    console.error(`[LLM] ${baseUrl} (${MODEL}) failed:`, error instanceof Error ? error.message : String(error));

    // Fallback to OpenAI cloud if local failed and fallback enabled
    if (FALLBACK_TO_CLOUD && baseUrl.includes("localhost")) {
      console.log("[LLM] Local endpoint failed, trying OpenAI cloud...");
      try {
        const cloudProvider = getProvider("https://api.openai.com/v1", apiKey);
        const systemMessage = options.messages.find(m => m.role === "system")?.content;
        const userMessages = options.messages.filter(m => m.role !== "system");

        const result = await generateText({
          model: cloudProvider(MODEL),
          system: systemMessage || undefined,
          messages: userMessages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
          temperature: options.temperature ?? 0.3,
        });
        return result.text;
      } catch (cloudError) {
        console.error("[LLM] Cloud API also failed:", cloudError instanceof Error ? cloudError.message : String(cloudError));
      }
    }

    throw new Error(`LLM error: ${String(error)}`);
  }
}
