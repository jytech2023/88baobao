// Daily rollup: compute one row of social_daily_stats per (platform, handle).
// Idempotent — re-running for the same date overwrites.
//
// Schedule: GitHub Actions, daily after fetch-social-metrics finishes.

import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron-auth";
import { rollupDaily } from "@/lib/social-sync/daily-rollup";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try { assertCronAuth(req); } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date") ?? undefined;

  try {
    const result = await rollupDaily(dateParam);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("rollup-daily failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
