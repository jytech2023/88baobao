/**
 * Customer profile analysis — fetch all 88 Bao Bao Yelp reviews,
 * combine, and ask AI Gateway to produce a customer persona report.
 *
 * Run: node --env-file=.env.local --import tsx scripts/customer-profile.ts
 *
 * Requires: YELP_API_KEY, AI_GATEWAY_API_KEY
 */
import { db } from "../src/db/client";
import { competitors } from "../src/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { getReviews, getBusiness } from "../src/lib/sources/yelp";
import { generateText } from "ai";
import { DEFAULT_MODEL } from "../src/lib/ai";

async function main() {
  const selfStores = await db
    .select()
    .from(competitors)
    .where(and(eq(competitors.isSelf, true), isNotNull(competitors.yelpId)));

  console.log(`Fetching reviews from ${selfStores.length} self stores...`);

  type Sample = {
    store: string;
    rating: number;
    text: string;
    author: string;
  };
  const samples: Sample[] = [];
  let totalReviewCount = 0;
  let weightedRating = 0;

  for (const s of selfStores) {
    if (!s.yelpId) continue;
    try {
      const biz = await getBusiness(s.yelpId);
      totalReviewCount += biz.reviewCount;
      weightedRating += biz.rating * biz.reviewCount;
      const reviews = await getReviews(s.yelpId);
      for (const r of reviews) {
        samples.push({
          store: s.name,
          rating: r.rating,
          text: r.content,
          author: r.authorName ?? "anon",
        });
      }
      console.log(
        `  ${s.name}: ${biz.rating}★ (${biz.reviewCount} total, ${reviews.length} samples)`,
      );
    } catch (e) {
      console.error(`  ${s.name}: ${e}`);
    }
  }

  if (samples.length === 0) {
    console.error("No samples — check YELP_API_KEY and yelpId values.");
    process.exit(1);
  }

  const overallRating = (weightedRating / totalReviewCount).toFixed(2);
  console.log(
    `\nTotal: ${totalReviewCount} reviews · weighted avg ${overallRating}★ · ${samples.length} sample texts\n`,
  );

  const reviewBlock = samples
    .slice(0, 80)
    .map(
      (s, i) =>
        `[${i + 1}] ${s.store} | ${s.rating}★ | ${s.author}\n${s.text.slice(0, 400)}`,
    )
    .join("\n\n");

  const { text } = await generateText({
    model: DEFAULT_MODEL,
    system:
      "You are a senior consumer-insights analyst for QSR / fast-casual restaurant chains. Be specific and actionable, not generic.",
    prompt: `Analyze the customer base of **88 Bao Bao**, an East Bay + Central Valley + Sacramento dim sum / xiao long bao chain (12 locations: Dublin, Concord, Brentwood, Davis, Manteca, Stockton, Merced, Roseville, Vacaville, Vallejo, Castro Valley, Riverbank coming).

Total Yelp reviews across stores: ${totalReviewCount}, weighted avg ${overallRating}★.

Below are ${Math.min(samples.length, 80)} review samples (3 per store):

${reviewBlock}

Produce a structured customer profile report covering:

1. **Demographic guess** — ethnicity mix, age, family vs solo, income tier (with evidence quotes)
2. **Top 5 things customers love** (with sample quotes)
3. **Top 5 complaints / risks**
4. **Mentioned competitors / comparisons** (Din Tai Fung? Local mom-and-pop? Boba shops?)
5. **Language / tone** — what % English vs Chinese vs other; formal vs casual; use of emojis
6. **Use cases** — date night, family weekend, quick lunch, takeout, late night?
7. **Unmet needs** — what would they pay more for?
8. **Marketing channel recommendation** — given the demographic, where should 88 Bao Bao spend? (Yelp / Google / IG / TikTok / 小红书 / Facebook)
9. **3 concrete operational improvements** ranked by impact/effort

Format in Markdown. Lead with the single most important finding.`,
  });

  console.log("\n========== CUSTOMER PROFILE REPORT ==========\n");
  console.log(text);
  console.log("\n=============================================\n");

  // also save to disk
  const fs = await import("node:fs/promises");
  const path = `./reports/customer-profile-${new Date().toISOString().slice(0, 10)}.md`;
  await fs.mkdir("./reports", { recursive: true });
  await fs.writeFile(
    path,
    `# 88 Bao Bao — Customer Profile\n\n_Generated ${new Date().toISOString()}_\n_Based on ${totalReviewCount} Yelp reviews · ${samples.length} samples · weighted avg ${overallRating}★_\n\n${text}\n`,
  );
  console.log(`Saved to ${path}`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
