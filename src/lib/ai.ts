import { generateText, generateObject } from "ai";

// Accept either AI_GATEWAY_API_KEY (SDK default) or AI_GATEWAY_API
if (!process.env.AI_GATEWAY_API_KEY && process.env.AI_GATEWAY_API) {
  process.env.AI_GATEWAY_API_KEY = process.env.AI_GATEWAY_API;
}

/**
 * Vercel AI Gateway — model strings use the form "provider/model".
 * The SDK reads AI_GATEWAY_API_KEY from env automatically.
 * https://vercel.com/docs/ai-gateway
 */
export const DEFAULT_MODEL = "anthropic/claude-sonnet-4-5";
export const FAST_MODEL = "anthropic/claude-haiku-4-5";

export { generateText, generateObject };
