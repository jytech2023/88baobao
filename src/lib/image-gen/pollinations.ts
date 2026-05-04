// Pollinations.ai — completely free, no auth, no API key.
// FLUX-based image generation. Returns an image URL whose body is the binary.
// Rate limits exist but are generous; free tier may cap output size.

const BASE = "https://image.pollinations.ai/prompt";

export type PollinationsOptions = {
  prompt: string;
  width?: number;
  height?: number;
  /** "flux" | "flux-realism" | "any-dark" | etc.; defaults to flux. */
  model?: string;
  /** If true, don't include pollinations watermark. Note: their server may ignore on free tier. */
  nologo?: boolean;
  /** Prevent Pollinations from caching/sharing this prompt publicly. */
  private?: boolean;
};

/** Build the URL Pollinations serves the image at. */
export function pollinationsUrl(opts: PollinationsOptions): string {
  const u = new URL(`${BASE}/${encodeURIComponent(opts.prompt)}`);
  if (opts.width) u.searchParams.set("width", String(opts.width));
  if (opts.height) u.searchParams.set("height", String(opts.height));
  u.searchParams.set("model", opts.model ?? "flux");
  if (opts.nologo) u.searchParams.set("nologo", "true");
  if (opts.private) u.searchParams.set("private", "true");
  // 'enhance=true' makes Pollinations rewrite the prompt for better results.
  u.searchParams.set("enhance", "true");
  return u.toString();
}

/**
 * Returns the URL plus the bytes (we eagerly fetch so callers can rehost
 * the image to their own CDN — Pollinations doesn't promise URL stability).
 */
export async function generateImagePollinations(
  opts: PollinationsOptions,
): Promise<{ url: string; bytes: Uint8Array; contentType: string }> {
  const url = pollinationsUrl(opts);
  const res = await fetch(url, { headers: { Accept: "image/*" } });
  if (!res.ok) {
    throw new Error(`Pollinations failed: ${res.status} ${await res.text()}`);
  }
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { url, bytes, contentType };
}
