import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { competitors, mentions, trendSnapshots } from "@/db/schema";
import { eq, isNotNull } from "drizzle-orm";
import { getBusiness, getReviews } from "@/lib/sources/yelp";
import { classifyMention } from "@/lib/ai-classify";
import { createAlert } from "@/lib/alerts";
import { assertCronAuth } from "@/lib/cron-auth";

export const maxDuration = 300;

const BRAND_NAMES = ["88 Bao Bao", "88baobao", "88宝宝"];

export async function GET(req: NextRequest) {
  try {
    assertCronAuth(req);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const targets = await db
    .select()
    .from(competitors)
    .where(isNotNull(competitors.yelpId));

  const summary: Array<Record<string, unknown>> = [];

  for (const c of targets) {
    if (!c.yelpId) continue;
    try {
      const biz = await getBusiness(c.yelpId);
      await db.insert(trendSnapshots).values({
        source: "yelp",
        metric: "rating",
        competitorId: c.id,
        value: String(biz.rating),
      });
      await db.insert(trendSnapshots).values({
        source: "yelp",
        metric: "review_count",
        competitorId: c.id,
        value: String(biz.reviewCount),
      });
      await db
        .update(competitors)
        .set({
          avgRating: String(biz.rating),
          reviewCount: biz.reviewCount,
          lastSnapshotAt: new Date(),
        })
        .where(eq(competitors.id, c.id));

      const reviews = await getReviews(c.yelpId);
      let newCount = 0;
      for (const r of reviews) {
        const cls = await classifyMention({
          source: "yelp",
          brandNames: BRAND_NAMES,
          text: r.content,
          rating: r.rating,
        }).catch(() => null);

        const inserted = await db
          .insert(mentions)
          .values({
            source: "yelp",
            externalId: r.externalId,
            competitorId: c.id,
            authorName: r.authorName,
            content: r.content,
            rating: r.rating,
            url: r.url,
            publishedAt: r.publishedAt,
            sentiment: cls?.sentiment,
            categories: cls?.categories,
            keywords: cls?.keywords,
            aiSummary: cls?.summary,
            language: cls?.language,
            isBrandMention: cls?.isBrandMention ?? c.isSelf,
          })
          .onConflictDoNothing({
            target: [mentions.source, mentions.externalId],
          })
          .returning({ id: mentions.id });

        if (inserted.length > 0) {
          newCount++;
          if (cls?.isCrisis || (r.rating <= 2 && c.isSelf)) {
            await createAlert({
              type: cls?.isCrisis ? "crisis_keyword" : "negative_review",
              severity: cls?.isCrisis ? "critical" : "warning",
              title: `${c.name} — ${r.rating}★ on Yelp`,
              body: r.content.slice(0, 500),
              sourceMentionId: inserted[0].id,
              payload: { url: r.url },
            });
          }
        }
      }
      summary.push({ name: c.name, new: newCount });
    } catch (e) {
      summary.push({ name: c.name, error: String(e) });
    }
  }

  return NextResponse.json({ ok: true, summary });
}
