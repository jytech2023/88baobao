/**
 * Seed all 88 Bao Bao stores into both `stores` and `competitors` (as self).
 *
 * Run: node --env-file=.env.local --import tsx scripts/seed-stores.ts
 *
 * Sources verified via Yelp / web search 2026:
 *   https://www.88baobaous.com/   (city list)
 *   yelp.com/biz/* slugs
 */
import { db } from "../src/db/client";
import { stores, competitors } from "../src/db/schema";
import { eq } from "drizzle-orm";

type StoreSeed = {
  slug: string;
  nameEn: string;
  status: "open" | "opening_soon" | "closed";
  addressLine1?: string;
  city: string;
  state: string;
  zip?: string;
  phone?: string;
  yelpSlug?: string; // yelp.com/biz/<slug>
};

const STORES: StoreSeed[] = [
  {
    slug: "dublin",
    nameEn: "88 Bao Bao — Dublin",
    status: "open",
    addressLine1: "3880 Fallon Rd",
    city: "Dublin",
    state: "CA",
    zip: "94568",
    phone: "(925) 361-5760",
    yelpSlug: "88-bao-bao-dublin-2",
  },
  {
    slug: "concord",
    nameEn: "88 Bao Bao — Concord",
    status: "open",
    addressLine1: "785 Oak Grove Rd Ste E3",
    city: "Concord",
    state: "CA",
    zip: "94518",
    yelpSlug: "88-bao-bao-concord",
  },
  {
    slug: "brentwood",
    nameEn: "88 Bao Bao — Brentwood",
    status: "open",
    addressLine1: "5421 Lone Tree Way #103",
    city: "Brentwood",
    state: "CA",
    zip: "94513",
  },
  {
    slug: "davis",
    nameEn: "88 Bao Bao — Davis",
    status: "open",
    addressLine1: "865 Russell Blvd #130",
    city: "Davis",
    state: "CA",
    zip: "95616",
  },
  {
    slug: "manteca",
    nameEn: "88 Bao Bao — Manteca",
    status: "open",
    addressLine1: "2235 W Atherton Dr #108",
    city: "Manteca",
    state: "CA",
    zip: "95337",
  },
  {
    slug: "stockton",
    nameEn: "88 Bao Bao — Stockton",
    status: "open",
    addressLine1: "10710 Trinity Pkwy Ste C",
    city: "Stockton",
    state: "CA",
    zip: "95219",
    phone: "(209) 888-4071",
  },
  {
    slug: "merced",
    nameEn: "88 Bao Bao — Merced",
    status: "open",
    addressLine1: "3564 G St",
    city: "Merced",
    state: "CA",
    zip: "95340",
    phone: "(209) 749-2114",
    yelpSlug: "88-bao-bao-merced",
  },
  {
    slug: "roseville",
    nameEn: "88 Bao Bao — Roseville",
    status: "open",
    addressLine1: "4181 Thrive Dr Ste 140",
    city: "Roseville",
    state: "CA",
    zip: "95678",
    phone: "(916) 773-0310",
    yelpSlug: "88-bao-bao-roseville",
  },
  {
    slug: "vacaville",
    nameEn: "88 Bao Bao — Vacaville",
    status: "open",
    addressLine1: "1639 E Monte Vista Ave Ste 105",
    city: "Vacaville",
    state: "CA",
    zip: "95688",
    phone: "(707) 474-5602",
    yelpSlug: "88-bao-bao-vacaville-3",
  },
  {
    slug: "vallejo",
    nameEn: "88 Bao Bao — Vallejo",
    status: "open",
    addressLine1: "145 Plaza Dr #209",
    city: "Vallejo",
    state: "CA",
    zip: "94591",
    phone: "(707) 563-5196",
    yelpSlug: "88-bao-bao-vallejo",
  },
  {
    slug: "castro-valley",
    nameEn: "88 Bao Bao — Castro Valley",
    status: "open",
    addressLine1: "3330 Village Dr",
    city: "Castro Valley",
    state: "CA",
    zip: "94546",
    yelpSlug: "88-bao-bao-castro-valley-3",
  },
  {
    slug: "riverbank",
    nameEn: "88 Bao Bao — Riverbank",
    status: "opening_soon",
    city: "Riverbank",
    state: "CA",
  },
];

async function main() {
  for (const s of STORES) {
    // upsert store
    const existing = await db
      .select()
      .from(stores)
      .where(eq(stores.slug, s.slug))
      .limit(1);

    let storeId: string;
    if (existing.length === 0) {
      const [row] = await db
        .insert(stores)
        .values({
          slug: s.slug,
          nameEn: s.nameEn,
          status: s.status,
          addressLine1: s.addressLine1,
          city: s.city,
          state: s.state,
          zip: s.zip,
          phone: s.phone,
        })
        .returning({ id: stores.id });
      storeId = row.id;
      console.log(`+ store ${s.slug}`);
    } else {
      storeId = existing[0].id;
      console.log(`= store ${s.slug}`);
    }

    // upsert as self-competitor for monitoring
    const compName = s.nameEn;
    const existingComp = await db
      .select()
      .from(competitors)
      .where(eq(competitors.name, compName))
      .limit(1);

    if (existingComp.length === 0) {
      await db.insert(competitors).values({
        name: compName,
        type: "self",
        isSelf: true,
        cuisine: "dim sum",
        yelpId: s.yelpSlug,
        websiteUrl: "https://www.88baobaous.com/",
      });
      console.log(`  + competitor self/${s.slug}${s.yelpSlug ? " (yelp✓)" : ""}`);
    }
  }

  // remove the old generic "88 Bao Bao (Dublin)" placeholder from earlier seed
  await db
    .delete(competitors)
    .where(eq(competitors.name, "88 Bao Bao (Dublin)"));

  console.log("✅ Stores seed complete");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
