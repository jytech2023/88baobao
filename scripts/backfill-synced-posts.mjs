// Backfill the 5 IG posts that fired during today's local cron test but never
// got recorded in synced_posts (the cron was still writing to Apify KV).

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

const proj = await sql`SELECT id FROM projects WHERE slug = '88baobao' LIMIT 1`;
if (proj.length === 0) { console.error("no 88baobao project"); process.exit(1); }
const projectId = proj[0].id;

const ROWS = [
  {
    source_id: "3683427996869632654",
    short_code: "DMeKj9dJKKO",
    source_url: "https://www.instagram.com/p/DMeKj9dJKKO/",
    source_posted_at: "2025-07-24T01:01:59.000Z",
    destination_id: "69f7b283b2bf116e3e56b60f",
    source_caption: "New dumpling and noodle spot in Roseville 🍜🥟",
  },
  {
    source_id: "3747814921628430377",
    short_code: "DQC6dB_kjAp",
    source_url: "https://www.instagram.com/p/DQC6dB_kjAp/",
    source_posted_at: "2025-10-20T21:06:15.000Z",
    destination_id: "69f7b291b2bf116e3e56b68a",
    source_caption: "🎉 88 Bao Bao Davis Grand Opening! 🎉",
  },
  {
    source_id: "3787888091219427378",
    short_code: "DSRSCZeEQAy",
    source_url: "https://www.instagram.com/p/DSRSCZeEQAy/",
    source_posted_at: "2025-12-15T04:04:29.000Z",
    destination_id: "69f7b2aa766f329adc277c3f",
    source_caption: "🎉 88 BaoBao Manteca Soft Opening 🎉",
  },
  {
    source_id: "3794879265163593114",
    short_code: "DSqHpXlkkWa",
    source_url: "https://www.instagram.com/p/DSqHpXlkkWa/",
    source_posted_at: "2025-12-24T19:34:42.000Z",
    destination_id: "69f7b2b5b2bf116e3e56b951",
    source_caption: "🎄✨ NEW at Davis Only! ✨🎄",
  },
  {
    source_id: "3828952270759949588",
    short_code: "DUjK824knUU",
    source_url: "https://www.instagram.com/p/DUjK824knUU/",
    source_posted_at: "2026-02-09T19:51:57.000Z",
    destination_id: "69f7b2c4766f329adc277cca",
    source_caption: "One of our favorites for dumplings & more 🔥🥟",
  },
];

// All 5 went out earlier today — using a single posted_at timestamp for them.
const POSTED_AT = "2026-05-03T17:59:02.000Z";

let added = 0;
for (const r of ROWS) {
  const result = await sql`
    INSERT INTO synced_posts (
      project_id, source_platform, source_id,
      source_url, source_caption, source_posted_at,
      destination_id, status, posted_at
    ) VALUES (
      ${projectId}, 'instagram', ${r.source_id},
      ${r.source_url}, ${r.source_caption}, ${r.source_posted_at},
      ${r.destination_id}, 'sent', ${POSTED_AT}
    )
    ON CONFLICT (project_id, source_platform, source_id) DO NOTHING
    RETURNING id
  `;
  if (result.length > 0) {
    added++;
    console.log(`✓ added: ig:${r.source_id} (${r.short_code})`);
  } else {
    console.log(`· skipped (already exists): ig:${r.source_id}`);
  }
}

const total = await sql`SELECT COUNT(*)::int AS n FROM synced_posts WHERE project_id = ${projectId}`;
console.log(`\nbackfill: +${added} rows, synced_posts now has ${total[0].n} total`);
