// Local one-shot runner — `npm run sync:local` to test the full pipeline
// without deploying. Reads .env.local automatically via Next's loader.

import { config } from "dotenv";
import { join } from "node:path";

config({ path: join(process.cwd(), ".env.local") });

(async () => {
  const { runSync } = await import("../../src/app/api/cron/sync-social/route");
  const result = await runSync();
  console.log(JSON.stringify(result, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
