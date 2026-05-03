// Seed the dedupe KV store with content IDs that have already been posted —
// either via manual tests or external cross-posting tools — so the cron
// doesn't re-post them on its first run.
//
// Usage:
//   npx tsx scripts/seed-state.ts ig:DUWfipUEqtM tiktok:7632056004439575838
//
// Pass dedupe keys (in the form `<source>:<id>`) as positional args.

import { config } from "dotenv";
import { join } from "node:path";
config({ path: join(process.cwd(), ".env.local") });

(async () => {
  const { recordPosted } = await import("../../src/lib/social-sync/store");

  const keys = process.argv.slice(2).filter(Boolean);
  if (keys.length === 0) {
    console.error("Usage: npx tsx scripts/seed-state.ts <source>:<id> [<source>:<id> ...]");
    console.error('  e.g. npx tsx scripts/seed-state.ts "ig:3825383653762050892"');
    process.exit(1);
  }
  console.log(`Seeding ${keys.length} dedupe key(s):`);
  keys.forEach((k) => console.log(`  - ${k}`));
  await recordPosted(keys);
  console.log("Done.");
})().catch((e) => { console.error(e); process.exit(1); });
