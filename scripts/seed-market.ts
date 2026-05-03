/**
 * Seed initial competitors + watch keywords for market monitoring.
 *
 * Run: pnpm tsx scripts/seed-market.ts
 *
 * NOTE: Place IDs / Yelp IDs are placeholders. Fill them in via:
 *   - Google: https://developers.google.com/maps/documentation/places/web-service/place-id
 *   - Yelp:   business URL slug, e.g. https://yelp.com/biz/<YELP_ID>
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../src/db/client";
import { competitors, watchKeywords } from "../src/db/schema";

async function main() {
  await db
    .insert(competitors)
    .values([
      // self
      {
        name: "88 Bao Bao (Dublin)",
        type: "self",
        isSelf: true,
        cuisine: "dim sum",
        websiteUrl: "https://www.88baobaous.com/",
      },
      // direct competitors
      { name: "Din Tai Fung", type: "category_lead", cuisine: "xlb" },
      { name: "Tim Ho Wan", type: "category_lead", cuisine: "dim sum" },
      { name: "Koi Palace", type: "direct", cuisine: "dim sum" },
      { name: "Yank Sing", type: "direct", cuisine: "dim sum" },
      { name: "Hong Kong Lounge", type: "direct", cuisine: "dim sum" },
      // indirect / fast casual asian
      { name: "Boiling Point", type: "indirect", cuisine: "hotpot" },
      { name: "Kura Sushi", type: "indirect", cuisine: "sushi" },
      { name: "Panda Express", type: "indirect", cuisine: "fast casual" },
    ])
    .onConflictDoNothing();

  await db
    .insert(watchKeywords)
    .values([
      // brand
      { keyword: "88 Bao Bao", purpose: "brand" },
      { keyword: "88baobao", purpose: "brand" },
      // category
      { keyword: "dim sum", purpose: "category" },
      { keyword: "xiao long bao", purpose: "category" },
      { keyword: "soup dumpling", purpose: "category" },
      { keyword: "bay area dim sum", purpose: "category" },
      // crisis
      { keyword: "food poisoning dim sum", purpose: "crisis" },
    ])
    .onConflictDoNothing();

  console.log("✅ Seed complete");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
