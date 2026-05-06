// Google Maps aggregate fetch via Serper.
//
// Replaces the old GOOGLE_PLACES_API_KEY + per-store gmbPlaceId pipeline
// (which required seeding a competitors table). Serper's /places endpoint
// takes "<name> <city>" and returns rating + ratingCount + address directly.
//
// Writes one row per store into social_daily_stats (platform="google",
// account_handle=<store-slug>) so the dashboard's TrafficSection picks them
// up alongside Yelp / IG / TikTok / FB.

import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { assertCronAuth } from "@/lib/cron-auth";
import { lookupGoogleBusiness } from "@/lib/sources/serper";
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
      const r = await lookupGoogleBusiness({
        name: store.nameEn,
        city: `${store.city}, ${store.state}`,
      });
      if (!r) {
        failed.push({ slug: store.slug, reason: "no Google Places match" });
        continue;
      }
      await sql`
        INSERT INTO social_daily_stats (
          project_id, platform, account_handle, date,
          reviews_count, avg_rating
        ) VALUES (
          ${projectId}, 'google', ${store.slug}, ${date}::date,
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
