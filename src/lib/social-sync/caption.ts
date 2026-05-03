// AI-moderated caption rewriter.
//
// When AI_GATEWAY_API_KEY is set, an LLM reads each caption together with the
// original post date and decides whether the content needs reframing —
// time-sensitive announcements (grand openings, "this Friday", countdowns,
// "today only") get rewritten as throwbacks; evergreen content passes through
// verbatim; third-party reviewer voices get rewritten in the brand's voice.
//
// Without the key, falls back to a deterministic prefix based on age.

import { generateText } from "ai";
import { env } from "./env";

export async function rewriteCaption(original: string, postedAt: string): Promise<string> {
  if (!original.trim()) return original;
  const ageDays = Math.floor((Date.now() - new Date(postedAt).getTime()) / 86_400_000);

  if (env.aiGatewayApiKey()) {
    try {
      return await aiRewrite(original, postedAt, ageDays);
    } catch (err) {
      console.warn("AI caption rewrite failed; falling back to deterministic", err);
    }
  }
  if (ageDays <= env.throwbackDays()) return original;
  return prefixThrowback(original, ageDays);
}

async function aiRewrite(original: string, postedAt: string, ageDays: number): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const postedDate = postedAt.slice(0, 10);

  const system = [
    "You moderate captions for the 88 Bao Bao Facebook page, which auto-reposts content from their Instagram and TikTok.",
    "",
    `Today is ${today}. The caption you receive was originally posted on ${postedDate} (${ageDays} days ago).`,
    "",
    "Decide whether the caption needs reframing:",
    "- If it refers to time-sensitive events that no longer match (grand opening dates, \"this Friday\", \"tomorrow\", \"today only\", countdowns, upcoming events, \"now happening\") AND the date gap makes those references wrong, reframe as a memory/throwback. Convert future tense to past tense, drop CTAs that no longer apply (\"come this Friday!\" → \"we're open daily\"), use natural framings like \"Looking back at...\", \"Throwback to...\", \"Memories from...\".",
    "- If the caption is evergreen (general menu praise, location info, recipes, food vibes), return it verbatim.",
    "- If the caption is from a third-party reviewer's voice (says \"@88baobao_official just opened\" or talks about 88 Bao Bao in third person), rewrite from the brand's first-person voice while keeping the substance.",
    "",
    "Always preserve factual details (addresses, store names, product names, prices, hashtags). Keep the friendly brand voice and emoji usage.",
    "",
    "Output ONLY the final caption. No preamble, no explanation, no quotes.",
  ].join("\n");

  // AI SDK auto-routes to Vercel AI Gateway when AI_GATEWAY_API_KEY is set.
  const { text } = await generateText({
    model: "anthropic/claude-haiku-4.5",
    system,
    prompt: original,
    temperature: 0.4,
    maxRetries: 2,
  });

  return text.trim() || original;
}

function prefixThrowback(text: string, ageDays: number): string {
  const lead =
    ageDays > 180 ? "🕰️ Throwback —"
    : ageDays > 60 ? "💭 Looking back —"
    : "📅 ICYMI —";
  return `${lead}\n\n${text}`;
}
