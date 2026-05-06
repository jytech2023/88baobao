// Yelp aggregate fetch via Serper.
//
// Yelp Fusion's free tier was retired in 2024 (~$229/mo minimum for new
// applicants), and yelp.com itself 403s server IPs. We instead search Google
// for each store with `site:yelp.com` and read the rating / ratingCount that
// comes back attached to the SERP rich result.
//
// Writes one row per store into social_daily_stats (platform="yelp",
// account_handle=<store-slug>) so the dashboard's TrafficSection picks them
// up alongside IG / TikTok / FB.

import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { assertCronAuth } from "@/lib/cron-auth";
import { lookupYelpBusiness } from "@/lib/sources/serper";
import { STORES } from "@/lib/stores";
import { PROJECT_ID } from "@/lib/project";

export const runtime = "nodejs";
export const maxDuration = 300;

const sql = neon(process.env.DATABASE_URL!);

export async function GET(req: NextRequest) {
  try {
    assertCronAuth(req);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const projectId = PROJECT_ID;

  const date = new Date().toISOString().slice(0, 10);
  const saved: Array<{ slug: string; rating: number; reviews: number }> = [];
  const failed: Array<{ slug: string; reason: string }> = [];

  for (const store of STORES) {
    if (store.status !== "open") continue;
    try {
      const r = await lookupYelpBusiness({
        name: store.nameEn,
        city: `${store.city}, ${store.state}`,
        slug: store.yelpSlug,
      });
      if (!r) {
        failed.push({ slug: store.slug, reason: "no Yelp SERP match" });
        continue;
      }
      await sql`
        INSERT INTO social_daily_stats (
          project_id, platform, account_handle, date,
          reviews_count, avg_rating
        ) VALUES (
          ${projectId}, 'yelp', ${store.slug}, ${date}::date,
          ${r.ratingCount}, ${r.rating}
        )
        ON CONFLICT (project_id, platform, account_handle, date) DO UPDATE SET
          reviews_count = EXCLUDED.reviews_count,
          avg_rating    = EXCLUDED.avg_rating,
          computed_at   = NOW()
      `;
      saved.push({ slug: store.slug, rating: r.rating, reviews: r.ratingCount });
    } catch (err) {
      failed.push({
        slug: store.slug,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ ok: true, date, saved, failed });
}
