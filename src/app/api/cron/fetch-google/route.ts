import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { competitors, mentions, trendSnapshots } from "@/db/schema";
import { eq, isNotNull } from "drizzle-orm";
import { fetchPlaceDetails } from "@/lib/sources/google-places";
import { classifyMention } from "@/lib/ai-classify";
import { createAlert } from "@/lib/alerts";
import { assertCronAuth } from "@/lib/cron-auth";

export const maxDuration = 300;

const BRAND_NAMES = ["88 Bao Bao", "88baobao", "88 baobao", "88宝宝", "宝宝点心"];

export async function GET(req: NextRequest) {
  try {
    assertCronAuth(req);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const targets = await db
    .select()
    .from(competitors)
    .where(isNotNull(competitors.gmbPlaceId));

  const summary: Array<{ name: string; new: number; total: number }> = [];

  for (const c of targets) {
    if (!c.gmbPlaceId) continue;
    try {
      const details = await fetchPlaceDetails(c.gmbPlaceId);

      // snapshot rating + count
      if (details.rating != null) {
        await db.insert(trendSnapshots).values({
          source: "google",
          metric: "rating",
          competitorId: c.id,
          value: String(details.rating),
        });
      }
      if (details.userRatingCount != null) {
        await db.insert(trendSnapshots).values({
          source: "google",
          metric: "review_count",
          competitorId: c.id,
          value: String(details.userRatingCount),
        });
      }
      await db
        .update(competitors)
        .set({
          avgRating: details.rating != null ? String(details.rating) : null,
          reviewCount: details.userRatingCount ?? 0,
          lastSnapshotAt: new Date(),
        })
        .where(eq(competitors.id, c.id));

      // store new reviews
      let newCount = 0;
      for (const r of details.reviews) {
        const cls = r.content
          ? await classifyMention({
              source: "google",
              brandNames: BRAND_NAMES,
              text: r.content,
              rating: r.rating,
            }).catch(() => null)
          : null;

        const inserted = await db
          .insert(mentions)
          .values({
            source: "google",
            externalId: r.externalId,
            competitorId: c.id,
            authorName: r.authorName,
            content: r.content,
            rating: r.rating,
            publishedAt: r.publishedAt,
            language: cls?.language ?? r.language,
            sentiment: cls?.sentiment,
            categories: cls?.categories,
            keywords: cls?.keywords,
            aiSummary: cls?.summary,
            isBrandMention: cls?.isBrandMention ?? c.isSelf,
          })
          .onConflictDoNothing({
            target: [mentions.source, mentions.externalId],
          })
          .returning({ id: mentions.id });

        if (inserted.length > 0) {
          newCount++;
          // crisis alert
          if (cls?.isCrisis || (r.rating != null && r.rating <= 2 && c.isSelf)) {
            await createAlert({
              type: cls?.isCrisis ? "crisis_keyword" : "negative_review",
              severity: cls?.isCrisis ? "critical" : "warning",
              title: `${c.name} — ${r.rating ?? "?"}★ on Google`,
              body: r.content?.slice(0, 500),
              sourceMentionId: inserted[0].id,
              payload: { url: r.externalId, author: r.authorName },
            });
          }
        }
      }

      summary.push({ name: c.name, new: newCount, total: details.reviews.length });
    } catch (e) {
      summary.push({ name: c.name, new: 0, total: 0, ...{ error: String(e) } });
    }
  }

  return NextResponse.json({ ok: true, summary });
}
