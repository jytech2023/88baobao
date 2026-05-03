/**
 * Competitor enrichment via Yelp Search.
 *
 * For each known competitor brand (Din Tai Fung, Tim Ho Wan, ...) that doesn't
 * have a yelpId yet, search Yelp near our store cities and pick the best match.
 *
 * Run: node --env-file=.env.local --import tsx scripts/enrich-competitors.ts
 *
 * Requires: YELP_API_KEY
 */
import { db } from "../src/db/client";
import { competitors, stores } from "../src/db/schema";
import { and, eq, isNull, ne } from "drizzle-orm";
import { searchBusinesses } from "../src/lib/sources/yelp";

type YelpBiz = {
  id: string;
  name: string;
  rating?: number;
  review_count?: number;
  location?: { city?: string; address1?: string };
};

async function main() {
  const targets = await db
    .select()
    .from(competitors)
    .where(and(eq(competitors.isSelf, false), isNull(competitors.yelpId)));

  // search around our store cities (gives us SF Bay + Sacramento coverage)
  const ourStores = await db.select().from(stores).where(ne(stores.status, "closed"));
  const cities = Array.from(
    new Set(
      ourStores
        .filter((s) => s.city && s.state)
        .map((s) => `${s.city}, ${s.state}`),
    ),
  );

  console.log(
    `Enriching ${targets.length} competitors across ${cities.length} cities...\n`,
  );

  for (const c of targets) {
    let best: YelpBiz | null = null;
    let bestScore = -1;
    let bestCity = "";

    for (const city of cities) {
      try {
        const data = await searchBusinesses({
          term: c.name,
          location: city,
          limit: 5,
        });
        for (const b of data.businesses as YelpBiz[]) {
          // fuzzy match: name contains target
          const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (!norm(b.name).includes(norm(c.name).slice(0, 8))) continue;
          const score = (b.review_count ?? 0) * (b.rating ?? 0);
          if (score > bestScore) {
            bestScore = score;
            best = b;
            bestCity = city;
          }
        }
      } catch (e) {
        console.error(`  search "${c.name}" near ${city}: ${e}`);
      }
      // gentle pace
      await new Promise((r) => setTimeout(r, 100));
    }

    if (best) {
      await db
        .update(competitors)
        .set({
          yelpId: best.id,
          avgRating: best.rating != null ? String(best.rating) : null,
          reviewCount: best.review_count ?? 0,
        })
        .where(eq(competitors.id, c.id));
      console.log(
        `✓ ${c.name} → ${best.id} (${best.rating}★, ${best.review_count} reviews) near ${bestCity}`,
      );
    } else {
      console.log(`✗ ${c.name} — no match found`);
    }
  }

  console.log("\n✅ Enrichment complete");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
