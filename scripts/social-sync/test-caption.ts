import { config } from "dotenv";
import { join } from "node:path";
config({ path: join(process.cwd(), ".env.local") });

(async () => {
  const { rewriteCaption } = await import("../../src/lib/social-sync/caption");

  const cases = [
    {
      label: "Time-sensitive (Manteca grand opening, ~3mo old)",
      postedAt: "2026-02-04T21:41:54.000Z",
      caption: `🎉 88 BAO BAO MANTECA GRAND OPENING! 🎉

📍 2235 West Atherton Dr, Manteca, CA 95337
📅 Friday, 2/13
⏰ Ribbon Cutting: 10AM | Doors Open: 11AM

Manteca, we're making it official! 🎊 Join us for the official grand opening celebration of 88 Bao Bao Manteca on February 13th.

🔥 20% OFF your entire order — ALL DAY!

Free gift set limited to one per table while supplies last.`,
    },
    {
      label: "3rd-party reviewer voice (Roseville, ~10mo old)",
      postedAt: "2025-07-07T17:28:43.000Z",
      caption: `Dumplings just feel like a hug you can eat. 🤤🥟

@88baobao_official just opened in Roseville and it already feels like a spot we'll be coming back to. The xiao long bao were juicy and flavorful.

📍88 Bao Bao – 4181 Thrive Dr., Roseville, CA 95678`,
    },
    {
      label: "Evergreen (recent, should pass through verbatim)",
      postedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      caption: `our newest edition to our menu: Mapo Tofu! 🥢

#88BaoBaoStockton #88BaoBao #fyp #chinesefood`,
    },
  ];

  for (const c of cases) {
    console.log("════════════════════════════════════════════════════════");
    console.log("CASE:", c.label);
    console.log("ORIGINAL:");
    console.log(c.caption);
    console.log("---");
    const out = await rewriteCaption(c.caption, c.postedAt);
    console.log("REWRITTEN:");
    console.log(out);
    console.log("");
  }
})().catch((e) => { console.error(e); process.exit(1); });
