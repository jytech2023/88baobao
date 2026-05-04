// Project-wide image generation with multi-provider fallback.
//
// Order (quality-first):
//   1. dev.to internal      — free, high quality (nano-banana / Gemini Flash Image),
//                             session-cookie auth (cookies last weeks-to-months)
//   2. AI Gateway (Imagen)  — paid (~$0.04/img), reliable, high quality
//   3. Pollinations.ai      — free, no auth, but lower quality (FLUX schnell, downsized)
//
// Pass `force: "pollinations"` if you specifically want zero cost and don't
// care about quality (e.g. a high-volume per-post avatar generator).
//
// Each provider is tried in order; on failure we move to the next. Callers
// receive bytes (always) plus the original URL the provider returned.

import { experimental_generateImage as aiGenerateImage } from "ai";
import { generateImagePollinations } from "./pollinations";
import { generateImageDevto } from "./devto";

export type ImageProvider = "pollinations" | "devto" | "ai-gateway";

export type GenerateImageOptions = {
  prompt: string;
  /** Pixel size (provider-best-effort). */
  width?: number;
  height?: number;
  /** Skip earlier providers and force this one. Useful for tests + admin tools. */
  force?: ImageProvider;
  /** AI Gateway image model when falling back. */
  fallbackModel?: string;
};

export type GenerateImageResult = {
  bytes: Uint8Array;
  contentType: string;
  /** The provider's hosted URL, if any. May be ephemeral — rehost if you need stability. */
  sourceUrl?: string;
  source: ImageProvider;
};

const DEFAULT_W = 1536;
const DEFAULT_H = 1024;

export async function generateImage(opts: GenerateImageOptions): Promise<GenerateImageResult> {
  const order: ImageProvider[] = opts.force
    ? [opts.force]
    : ["devto", "ai-gateway", "pollinations"];

  let lastErr: unknown;
  for (const provider of order) {
    try {
      switch (provider) {
        case "pollinations": {
          const r = await generateImagePollinations({
            prompt: opts.prompt,
            width: opts.width ?? DEFAULT_W,
            height: opts.height ?? DEFAULT_H,
          });
          return { bytes: r.bytes, contentType: r.contentType, sourceUrl: r.url, source: "pollinations" };
        }
        case "devto": {
          const url = await generateImageDevto(opts.prompt);
          // Eagerly fetch bytes so callers can rehost
          const res = await fetch(url);
          if (!res.ok) throw new Error(`dev.to image fetch failed: ${res.status}`);
          const bytes = new Uint8Array(await res.arrayBuffer());
          return {
            bytes,
            contentType: res.headers.get("content-type") ?? "image/png",
            sourceUrl: url,
            source: "devto",
          };
        }
        case "ai-gateway": {
          const { image } = await aiGenerateImage({
            model: opts.fallbackModel ?? "google/imagen-4.0-generate-001",
            prompt: opts.prompt,
            size: `${opts.width ?? DEFAULT_W}x${opts.height ?? DEFAULT_H}` as `${number}x${number}`,
            n: 1,
          });
          return { bytes: image.uint8Array, contentType: "image/png", source: "ai-gateway" };
        }
      }
    } catch (err) {
      console.warn(`[image-gen] ${provider} failed:`, err instanceof Error ? err.message : err);
      lastErr = err;
    }
  }
  throw new Error(
    `All image-gen providers failed: ${lastErr instanceof Error ? lastErr.message : lastErr}`,
  );
}
