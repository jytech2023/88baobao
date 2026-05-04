// Iterate all 'source'-role accounts in social_sources and snapshot each
// platform's metrics into social_metrics_snapshots.
// Mirrors what /api/cron/fetch-social-metrics does, runnable directly:
//   doppler run -- node scripts/seed-social-metrics.mjs

import { neon } from "@neondatabase/serverless";

const APIFY = "https://api.apify.com/v2/acts";
const sql = neon(process.env.DATABASE_URL);

async function snapshotIg(username) {
  const r = await fetch(
    `${APIFY}/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(process.env.APIFY_TOKEN)}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usernames: [username], resultsLimit: 1 }) },
  );
  if (!r.ok) throw new Error(`IG ${r.status}`);
  const arr = await r.json();
  const p = arr[0];
  if (!p) throw new Error(`no data for @${username}`);
  return {
    platform: "instagram",
    handle: p.username ?? username,
    externalId: p.id ?? null,
    profileUrl: `https://www.instagram.com/${username}/`,
    followersCount: p.followersCount ?? null,
    followingCount: p.followsCount ?? null,
    postsCount: p.postsCount ?? null,
    raw: p,
  };
}

async function snapshotTt(username) {
  const r = await fetch(
    `${APIFY}/clockworks~free-tiktok-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(process.env.APIFY_TOKEN)}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profiles: [username], resultsPerPage: 10, shouldDownloadVideos: false, shouldDownloadCovers: false }) },
  );
  if (!r.ok) throw new Error(`TT ${r.status}`);
  const items = await r.json();
  const a = items[0]?.authorMeta;
  const sample = items.slice(0, 10);
  const eng = sample.length
    ? sample.reduce((s, i) => s + (i.diggCount ?? 0) + (i.commentCount ?? 0) + (i.shareCount ?? 0), 0) / sample.length
    : null;
  return {
    platform: "tiktok",
    handle: a?.name ?? username,
    externalId: a?.id ?? null,
    profileUrl: `https://www.tiktok.com/@${username}`,
    followersCount: a?.fans ?? null,
    followingCount: a?.following ?? null,
    postsCount: a?.video ?? null,
    totalLikes: a?.heart ?? null,
    totalViews: sample.reduce((s, i) => s + (i.playCount ?? 0), 0),
    avgEngagement: eng,
    raw: { author: a, sample: sample.length },
  };
}

async function snapshotFb() {
  const r = await fetch("https://api.buffer.com/2/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.BUFFER_API_KEY}` },
    body: JSON.stringify({
      query: `query Recent($input: PostsInput!, $first: Int) { posts(input: $input, first: $first) { edges { node { id status createdAt } } } }`,
      variables: {
        input: {
          organizationId: process.env.BUFFER_ORGANIZATION_ID,
          filter: { channelIds: [process.env.BUFFER_CHANNEL_ID], status: ["sent"] },
          sort: [{ field: "createdAt", direction: "desc" }],
        },
        first: 50,
      },
    }),
  });
  let postsCount = null, raw = null;
  if (r.ok) {
    const d = await r.json();
    postsCount = d.data?.posts?.edges?.length ?? null;
    raw = d.data;
  }
  return {
    platform: "facebook",
    handle: "88baobao",
    externalId: "61570636683046",
    profileUrl: "https://www.facebook.com/profile.php?id=61570636683046",
    postsCount,
    raw,
  };
}

const proj = await sql`SELECT id FROM projects WHERE slug = '88baobao' LIMIT 1`;
const projectId = proj[0]?.id;
if (!projectId) { console.error("no 88baobao project"); process.exit(1); }

// Read sources from DB instead of using fixed env vars
const sources = await sql`
  SELECT platform, username FROM social_sources
  WHERE project_id = ${projectId} AND role = 'source'
  ORDER BY platform, username
`;
console.log(`Will snapshot ${sources.length} source account(s) + Facebook page`);

const tasks = [];
for (const s of sources) {
  if (s.platform === "instagram") tasks.push([`ig:${s.username}`, () => snapshotIg(s.username)]);
  else if (s.platform === "tiktok") tasks.push([`tt:${s.username}`, () => snapshotTt(s.username)]);
}
tasks.push(["fb:page", () => snapshotFb()]);

let saved = 0, failed = 0;
for (const [name, fn] of tasks) {
  try {
    const s = await fn();
    await sql`
      INSERT INTO social_metrics_snapshots
        (project_id, platform, handle, external_id, profile_url,
         followers_count, following_count, posts_count,
         total_likes, total_views, avg_engagement, raw)
      VALUES
        (${projectId}, ${s.platform}, ${s.handle ?? null}, ${s.externalId ?? null}, ${s.profileUrl ?? null},
         ${s.followersCount ?? null}, ${s.followingCount ?? null}, ${s.postsCount ?? null},
         ${s.totalLikes ?? null}, ${s.totalViews ?? null}, ${s.avgEngagement ?? null}, ${JSON.stringify(s.raw)})
    `;
    saved++;
    console.log(`✓ ${name.padEnd(38)} followers=${s.followersCount ?? "—"} posts=${s.postsCount ?? "—"}`);
  } catch (e) {
    failed++;
    console.error(`✗ ${name.padEnd(38)} ${e.message}`);
  }
}
console.log(`\nSaved ${saved}, failed ${failed}`);
