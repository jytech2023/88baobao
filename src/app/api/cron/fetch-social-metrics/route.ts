// Snapshot follower/engagement counts for IG + TikTok + FB.
// Runs daily via GitHub Actions; results land in social_metrics_snapshots.

import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { assertCronAuth } from "@/lib/cron-auth";
import { snapshotInstagram, snapshotTikTok, snapshotFacebook } from "@/lib/social-metrics";

export const runtime = "nodejs";
export const maxDuration = 300;

const sql = neon(process.env.DATABASE_URL!);

async function projectIdFor(slug: string): Promise<string | null> {
  const rows = (await sql`SELECT id FROM projects WHERE slug = ${slug} LIMIT 1`) as { id: string }[];
  return rows[0]?.id ?? null;
}

export async function GET(req: NextRequest) {
  try { assertCronAuth(req); } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unauthorized" }, { status: 401 });
  }

  const projectId = await projectIdFor("88baobao");
  if (!projectId) {
    return NextResponse.json({ ok: false, error: "project '88baobao' not found" }, { status: 500 });
  }

  // Read all 'source'-role accounts from social_sources for this project,
  // plus Facebook as a single 'destination' (since Buffer aggregates posts
  // across the connected page channel).
  const sources = (await sql`
    SELECT platform, username
    FROM social_sources
    WHERE project_id = ${projectId} AND role = 'source'
  `) as { platform: string; username: string | null }[];

  const tasks: Array<{ key: string; fn: () => Promise<unknown> }> = [];
  for (const s of sources) {
    if (s.platform === "instagram" && s.username) {
      tasks.push({ key: `instagram:${s.username}`, fn: () => snapshotInstagram(s.username!) });
    } else if (s.platform === "tiktok" && s.username) {
      tasks.push({ key: `tiktok:${s.username}`, fn: () => snapshotTikTok(s.username!) });
    }
  }
  tasks.push({ key: "facebook:page", fn: () => snapshotFacebook() });

  const result: { saved: string[]; failed: { platform: string; reason: string }[] } = {
    saved: [],
    failed: [],
  };

  await Promise.all(
    tasks.map(async ({ key, fn }) => {
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
    }),
  );

  return NextResponse.json({ ok: true, ...result });
}
