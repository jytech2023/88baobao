import { generateObject } from "ai";
import { z } from "zod";
import { FAST_MODEL } from "./ai";

/**
 * Cheap one-shot classification for any review/post/mention.
 * Uses Claude Haiku via Vercel AI Gateway → fast & cheap.
 */

const schema = z.object({
  sentiment: z.enum(["positive", "neutral", "negative"]),
  categories: z.array(z.string()).max(6),
  keywords: z.array(z.string()).max(10),
  isBrandMention: z.boolean(),
  isCrisis: z.boolean(),
  language: z.string().optional(),
  summary: z.string().max(300),
});

export type Classification = z.infer<typeof schema>;

const CRISIS_HINT = `Crisis = food safety, illness, injury, harassment, racism, lawsuit, bug/hair, severely cold/uncooked food, walked out, called police.`;

export async function classifyMention(args: {
  source: string;
  brandNames: string[]; // ["88 Bao Bao", "88baobao", "88宝宝"]
  text: string;
  rating?: number | null;
}): Promise<Classification> {
  const { object } = await generateObject({
    model: FAST_MODEL,
    schema,
    system:
      "You classify customer reviews and social posts for a restaurant chain. Return strict JSON.",
    prompt: `Source: ${args.source}
Rating (1-5): ${args.rating ?? "N/A"}
Brand names to detect: ${args.brandNames.join(", ")}

Categories to choose from (pick the most relevant 1-4):
food_quality, service, wait_time, price, cleanliness, ambience, takeout, delivery, staff, dim_sum, xiao_long_bao, noodles, other

${CRISIS_HINT}

isBrandMention = true if any brand name (or obvious variant/typo) is mentioned.
isCrisis = true only for serious issues per the hint above.
language = ISO code (en, zh, es...).
summary = 1-2 sentences in English.

Text:
"""
${args.text.slice(0, 3000)}
"""`,
  });
  return object;
}
