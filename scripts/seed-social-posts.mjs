// Backfill social_posts with the latest posts from every IG + TikTok source
// account. Targets ~last quarter of activity (50 posts/account is plenty for
// a chain that posts a few times per week).
//
// Idempotent: re-running upserts (engagement counts get refreshed).
//
//   doppler run -- node scripts/seed-social-posts.mjs

import { neon } from "@neondatabase/serverless";

const APIFY = "https://api.apify.com/v2/acts";
const PER_ACCOUNT_LIMIT = 50;
const sql = neon(process.env.DATABASE_URL);

const proj = await sql`SELECT id FROM projects WHERE slug = '88baobao' LIMIT 1`;
const projectId = proj[0]?.id;
if (!projectId) { console.error("no 88baobao project"); process.exit(1); }

const sources = await sql`
  SELECT platform, username FROM social_sources
  WHERE project_id = ${projectId} AND role = 'source'
  ORDER BY platform, username
`;
console.log(`Pulling posts for ${sources.length} source account(s) (limit ${PER_ACCOUNT_LIMIT}/account)...`);

async function fetchIgPosts(username) {
  const r = await fetch(
    `${APIFY}/apify~instagram-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(process.env.APIFY_TOKEN)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        directUrls: [`https://www.instagram.com/${username}/`],
        resultsType: "posts",
        resultsLimit: PER_ACCOUNT_LIMIT,
        addParentData: false,
      }),
    },
  );
  if (!r.ok) throw new Error(`IG ${username}: ${r.status}`);
  const arr = await r.json();
  return arr.map((p) => ({
    platform: "instagram",
    accountHandle: username,
    externalId: p.id,
    shortCode: p.shortCode ?? null,
    url: p.url ?? `https://www.instagram.com/p/${p.shortCode}/`,
    type: p.type ?? null,
    caption: p.caption ?? null,
    coverUrl: p.displayUrl ?? null,
    mediaUrls: p.videoUrl ? [p.videoUrl] : (p.childPosts?.map((c) => c.displayUrl) ?? null),
    likesCount: p.likesCount ?? null,
    commentsCount: p.commentsCount ?? null,
    viewsCount: p.videoViewCount ?? null,
    postedAt: p.timestamp ?? null,
    raw: p,
  }));
}

async function fetchTtPosts(username) {
  const r = await fetch(
    `${APIFY}/clockworks~free-tiktok-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(process.env.APIFY_TOKEN)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profiles: [username],
        resultsPerPage: PER_ACCOUNT_LIMIT,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
      }),
    },
  );
  if (!r.ok) throw new Error(`TT ${username}: ${r.status}`);
  const arr = await r.json();
  return arr.map((p) => ({
    platform: "tiktok",
    accountHandle: username,
    externalId: String(p.id),
    shortCode: null,
    url: p.webVideoUrl ?? `https://www.tiktok.com/@${username}/video/${p.id}`,
    type: "video",
    caption: p.text ?? null,
    coverUrl: p.videoMeta?.coverUrl ?? null,
    mediaUrls: p.mediaUrls ?? null,
    likesCount: p.diggCount ?? null,
    commentsCount: p.commentCount ?? null,
    sharesCount: p.shareCount ?? null,
    viewsCount: p.playCount ?? null,
    savesCount: p.collectCount ?? null,
    postedAt: p.createTimeISO ?? null,
    raw: p,
  }));
}

async function upsert(p) {
  await sql`
    INSERT INTO social_posts (
      project_id, platform, account_handle, external_id, short_code, url, type,
      caption, cover_url, media_urls,
      likes_count, comments_count, shares_count, views_count, saves_count,
      raw, posted_at, fetched_at
    ) VALUES (
      ${projectId}, ${p.platform}, ${p.accountHandle ?? null}, ${p.externalId},
      ${p.shortCode ?? null}, ${p.url ?? null}, ${p.type ?? null},
      ${p.caption ?? null}, ${p.coverUrl ?? null},
      ${p.mediaUrls ? JSON.stringify(p.mediaUrls) : null},
      ${p.likesCount ?? null}, ${p.commentsCount ?? null},
      ${p.sharesCount ?? null}, ${p.viewsCount ?? null}, ${p.savesCount ?? null},
      ${p.raw ? JSON.stringify(p.raw) : null},
      ${p.postedAt}, NOW()
    )
    ON CONFLICT (platform, external_id) DO UPDATE SET
      account_handle = COALESCE(EXCLUDED.account_handle, social_posts.account_handle),
      caption        = COALESCE(EXCLUDED.caption,        social_posts.caption),
      cover_url      = COALESCE(EXCLUDED.cover_url,      social_posts.cover_url),
      likes_count    = EXCLUDED.likes_count,
      comments_count = EXCLUDED.comments_count,
      shares_count   = EXCLUDED.shares_count,
      views_count    = EXCLUDED.views_count,
      saves_count    = EXCLUDED.saves_count,
      raw            = EXCLUDED.raw,
      fetched_at     = NOW()
  `;
}

let totalSaved = 0, totalFailed = 0;
for (const s of sources) {
  try {
    const posts = s.platform === "instagram" ? await fetchIgPosts(s.username) :
                  s.platform === "tiktok"    ? await fetchTtPosts(s.username) :
                  [];
    let n = 0;
    for (const p of posts) {
      if (!p.externalId) continue;
      try { await upsert(p); n++; } catch (e) { console.error(`  upsert error ${p.externalId}: ${e.message}`); }
    }
    totalSaved += n;
    console.log(`✓ ${s.platform.padEnd(11)} @${s.username.padEnd(28)} ${n} posts saved`);
  } catch (e) {
    totalFailed++;
    console.error(`✗ ${s.platform} @${s.username}: ${e.message}`);
  }
}

const counts = await sql`
  SELECT platform, COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE posted_at > NOW() - INTERVAL '7 days')::int AS this_week,
    COUNT(*) FILTER (WHERE posted_at > NOW() - INTERVAL '30 days')::int AS this_month,
    COUNT(*) FILTER (WHERE posted_at > DATE_TRUNC('quarter', NOW()))::int AS this_quarter
  FROM social_posts WHERE project_id = ${projectId}
  GROUP BY platform
`;
console.log(`\nsocial_posts now contains:`);
for (const c of counts) {
  console.log(`  ${c.platform.padEnd(11)} total=${c.total}  this_week=${c.this_week}  this_month=${c.this_month}  this_quarter=${c.this_quarter}`);
}
