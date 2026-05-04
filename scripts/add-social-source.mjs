// Add a social-media sub-account to track for the 88baobao project.
// All matching 'source'-role rows are picked up by the metrics cron and
// summed on the dashboard.
//
// Usage:
//   doppler run -- node scripts/add-social-source.mjs <platform> <username> [external_id] [url]
//
// Examples:
//   doppler run -- node scripts/add-social-source.mjs instagram 88baobao.dublin
//   doppler run -- node scripts/add-social-source.mjs tiktok 88baobao.dublin
//   doppler run -- node scripts/add-social-source.mjs instagram 88baobao.manteca \
//     "" "https://www.instagram.com/88baobao.manteca/"

import { neon } from "@neondatabase/serverless";

const [, , platform, username, externalId, url] = process.argv;
if (!platform || !username) {
  console.error("Usage: add-social-source.mjs <platform> <username> [external_id] [url]");
  console.error("  platform: instagram | tiktok | facebook | youtube | xiaohongshu");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const proj = await sql`SELECT id FROM projects WHERE slug = '88baobao' LIMIT 1`;
if (proj.length === 0) {
  console.error("project '88baobao' not found");
  process.exit(1);
}
const projectId = proj[0].id;

// Default profile URLs for known platforms
const defaultUrl =
  platform === "instagram" ? `https://www.instagram.com/${username}/` :
  platform === "tiktok" ? `https://www.tiktok.com/@${username}` :
  platform === "youtube" ? `https://www.youtube.com/@${username}` :
  null;

await sql`
  INSERT INTO social_sources (project_id, platform, role, username, external_id, url)
  VALUES (${projectId}, ${platform}, 'source', ${username}, ${externalId || null}, ${url || defaultUrl})
`;

console.log(`✓ added: ${platform} @${username}`);
const all = await sql`
  SELECT platform, username FROM social_sources
  WHERE project_id = ${projectId} AND role = 'source'
  ORDER BY platform, username
`;
console.log(`now tracking ${all.length} source account(s):`);
for (const x of all) console.log(`  ${x.platform.padEnd(12)} @${x.username}`);
