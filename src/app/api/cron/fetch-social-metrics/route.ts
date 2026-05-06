// Snapshot follower/engagement counts for IG + TikTok + FB.
// Runs daily via GitHub Actions; results land in social_metrics_snapshots.

import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { assertCronAuth } from "@/lib/cron-auth";
import { snapshotInstagram, snapshotTikTok, snapshotFacebook } from "@/lib/social-metrics";
import { PROJECT_ID, SOCIAL_HANDLES } from "@/lib/project";

export const runtime = "nodejs";
export const maxDuration = 300;

const sql = neon(process.env.DATABASE_URL!);

export async function GET(req: NextRequest) {
  try { assertCronAuth(req); } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unauthorized" }, { status: 401 });
  }

  const projectId = PROJECT_ID;

  // Hardcoded source list — see src/lib/project.ts SOCIAL_HANDLES. The
  // social_sources table this used to read from got wiped during the same
  // db:push that took out projects.
  const tasks: Array<{ key: string; fn: () => Promise<unknown> }> = [];
  for (const username of SOCIAL_HANDLES.instagram) {
    tasks.push({ key: `instagram:${username}`, fn: () => snapshotInstagram(username) });
  }
  for (const username of SOCIAL_HANDLES.tiktok) {
    tasks.push({ key: `tiktok:${username}`, fn: () => snapshotTikTok(username) });
  }
  tasks.push({ key: "facebook:page", fn: () => snapshotFacebook() });

  const result: { saved: string[]; failed: { platform: string; reason: string }[] } = {
    saved: [],
    failed: [],
  };

  // Sequential, not Promise.all — Apify free tier returns 402 on concurrent
  // bursts of the same actor (observed 2026-05-05).
  for (const { key, fn } of tasks) {
    try {
      const snap = (await fn()) as Awaited<ReturnType<typeof snapshotInstagram>>;
      await sql`
        INSERT INTO social_metrics_snapshots
          (project_id, platform, handle, external_id, profile_url,
           followers_count, following_count, posts_count,
           total_likes, total_views, avg_engagement, raw)
        VALUES
          (${projectId}, ${snap.platform}, ${snap.handle ?? null}, ${snap.externalId ?? null}, ${snap.profileUrl ?? null},
           ${snap.followersCount ?? null}, ${snap.followingCount ?? null}, ${snap.postsCount ?? null},
           ${snap.totalLikes ?? null}, ${snap.totalViews ?? null}, ${snap.avgEngagement ?? null}, ${JSON.stringify(snap.raw)})
      `;
      result.saved.push(key);
    } catch (err) {
      result.failed.push({ platform: key, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ ok: true, ...result });
}
