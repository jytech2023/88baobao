// Compute one row of social_daily_stats per (platform, account_handle) for a
// given date. Idempotent UPSERT — re-running for today is safe and overwrites.
//
// Pulls from:
//   - synced_posts                 → posts_published count for the day
//   - social_metrics_snapshots     → followers_count + delta vs previous day
//   - reviews                      → reviews_count + avg_rating (Google + Yelp)

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

let projectIdCache: string | null = null;
async function projectId(): Promise<string> {
  if (projectIdCache) return projectIdCache;
  const rows = (await sql`SELECT id FROM projects WHERE slug = '88baobao' LIMIT 1`) as { id: string }[];
  if (rows.length === 0) throw new Error("project '88baobao' not found");
  projectIdCache = rows[0].id;
  return projectIdCache;
}

export type RollupResult = {
  date: string;
  rowsWritten: number;
  details: Array<{ platform: string; handle: string; posts: number; followers: number | null; delta: number | null }>;
};

/**
 * Compute rollup for `date` (YYYY-MM-DD). Defaults to today (UTC).
 */
export async function rollupDaily(dateStr?: string): Promise<RollupResult> {
  const pid = await projectId();
  const date = dateStr ?? new Date().toISOString().slice(0, 10);
  const prev = new Date(new Date(date).getTime() - 86400000).toISOString().slice(0, 10);

  // Posts published per (platform, handle) for the day, from synced_posts
  // (source side — counts our SOURCE channels, not the FB destination).
  const postsRows = (await sql`
    SELECT source_platform AS platform,
           COUNT(*)::int AS posts
    FROM synced_posts
    WHERE project_id = ${pid}
      AND DATE(posted_at AT TIME ZONE 'UTC') = ${date}::date
    GROUP BY source_platform
  `) as { platform: string; posts: number }[];

  // Today's followers per (platform, handle) — latest snapshot for that handle
  // taken on `date`.
  const todayFollowers = (await sql`
    SELECT DISTINCT ON (platform, handle)
      platform, handle, followers_count, total_likes, total_views, posts_count, avg_engagement
    FROM social_metrics_snapshots
    WHERE project_id = ${pid}
      AND DATE(fetched_at AT TIME ZONE 'UTC') = ${date}::date
    ORDER BY platform, handle, fetched_at DESC
  `) as { platform: string; handle: string | null; followers_count: number | null; total_likes: number | null; total_views: number | null; posts_count: number | null; avg_engagement: string | null }[];

  // Yesterday's followers for delta computation.
  const yesterdayFollowers = (await sql`
    SELECT DISTINCT ON (platform, handle)
      platform, handle, followers_count
    FROM social_metrics_snapshots
    WHERE project_id = ${pid}
      AND DATE(fetched_at AT TIME ZONE 'UTC') = ${prev}::date
    ORDER BY platform, handle, fetched_at DESC
  `) as { platform: string; handle: string | null; followers_count: number | null }[];

  const yKey = (p: string, h: string | null) => `${p}|${h ?? ""}`;
  const yMap = new Map(yesterdayFollowers.map((r) => [yKey(r.platform, r.handle), r.followers_count]));

  // Reviews aggregates per (platform = 'google'|'yelp').
  const reviewAgg = (await sql`
    SELECT source AS platform,
           COUNT(*) FILTER (WHERE DATE(published_at AT TIME ZONE 'UTC') = ${date}::date)::int AS reviews_count,
           AVG(rating)::numeric(3,2) AS avg_rating
    FROM reviews
    GROUP BY source
  `) as { platform: string; reviews_count: number; avg_rating: string | null }[];

  type Row = {
    platform: string;
    handle: string;
    posts: number;
    followers: number | null;
    delta: number | null;
    likes: number | null;
    views: number | null;
    reviews: number | null;
    rating: string | null;
  };
  const rowsByKey = new Map<string, Row>();

  // Seed from snapshots (per-handle rows)
  for (const s of todayFollowers) {
    const k = `${s.platform}|${s.handle ?? "*"}`;
    rowsByKey.set(k, {
      platform: s.platform,
      handle: s.handle ?? "*",
      posts: 0,
      followers: s.followers_count,
      delta: s.followers_count !== null && yMap.has(yKey(s.platform, s.handle))
        ? (s.followers_count ?? 0) - (yMap.get(yKey(s.platform, s.handle)) ?? 0)
        : null,
      likes: s.total_likes,
      views: s.total_views,
      reviews: null,
      rating: null,
    });
  }

  // Add platform-aggregate rows from synced_posts (handle = '*')
  for (const p of postsRows) {
    const k = `${p.platform}|*`;
    const existing = rowsByKey.get(k);
    if (existing) {
      existing.posts = p.posts;
    } else {
      rowsByKey.set(k, {
        platform: p.platform,
        handle: "*",
        posts: p.posts,
        followers: null, delta: null, likes: null, views: null, reviews: null, rating: null,
      });
    }
  }

  // Reviews aggregates → 'google'/'yelp' platform with handle = '*'
  for (const r of reviewAgg) {
    const k = `${r.platform}|*`;
    const existing = rowsByKey.get(k);
    if (existing) {
      existing.reviews = r.reviews_count;
      existing.rating = r.avg_rating;
    } else {
      rowsByKey.set(k, {
        platform: r.platform, handle: "*", posts: 0,
        followers: null, delta: null, likes: null, views: null,
        reviews: r.reviews_count, rating: r.avg_rating,
      });
    }
  }

  let n = 0;
  const details: RollupResult["details"] = [];
  for (const r of rowsByKey.values()) {
    await sql`
      INSERT INTO social_daily_stats (
        project_id, platform, account_handle, date,
        posts_published, total_likes, total_views,
        followers_count, followers_delta,
        reviews_count, avg_rating
      ) VALUES (
        ${pid}, ${r.platform}, ${r.handle}, ${date}::date,
        ${r.posts}, ${r.likes}, ${r.views},
        ${r.followers}, ${r.delta},
        ${r.reviews}, ${r.rating}
      )
      ON CONFLICT (project_id, platform, account_handle, date) DO UPDATE SET
        posts_published = EXCLUDED.posts_published,
        total_likes     = COALESCE(EXCLUDED.total_likes,     social_daily_stats.total_likes),
        total_views     = COALESCE(EXCLUDED.total_views,     social_daily_stats.total_views),
        followers_count = COALESCE(EXCLUDED.followers_count, social_daily_stats.followers_count),
        followers_delta = COALESCE(EXCLUDED.followers_delta, social_daily_stats.followers_delta),
        reviews_count   = COALESCE(EXCLUDED.reviews_count,   social_daily_stats.reviews_count),
        avg_rating      = COALESCE(EXCLUDED.avg_rating,      social_daily_stats.avg_rating),
        computed_at     = NOW()
    `;
    n++;
    details.push({ platform: r.platform, handle: r.handle, posts: r.posts, followers: r.followers, delta: r.delta });
  }

  return { date, rowsWritten: n, details };
}
