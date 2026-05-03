// Caption fingerprint for cross-source dedupe.
//
// Same content cross-posted on IG and TikTok would have different source-ids
// but near-identical captions. We hash a normalized version (lowercased, with
// URLs/handles/hashtags/punctuation stripped) so the same content from
// different sources produces the same fingerprint.
//
// Returns null when the normalized text is too short to dedupe reliably —
// short captions like "🥟" or "yum!" would otherwise collide and cause
// false-positive duplicates.

import crypto from "node:crypto";

const MIN_NORMALIZED_LENGTH = 30;

export function fingerprint(text: string): string | null {
  if (!text) return null;
  const normalized = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[@#][\w.]+/g, " ")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length < MIN_NORMALIZED_LENGTH) return null;
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}
