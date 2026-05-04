import { NextResponse } from "next/server";
import { fetchLatestPosts, type IgPost } from "@/lib/social-sync/instagram";
import { fetchLatestTikToks, type TikTokPost } from "@/lib/social-sync/tiktok";
import {
  getSeenIds,
  getSeenFingerprints,
  recordSyncedPost,
  recordRunStart,
  recordRunFinish,
} from "@/lib/social-sync/store";
import { rehost } from "@/lib/social-sync/rehost";
import { archiveVideo } from "@/lib/social-sync/video-archive";
import { rewriteCaption } from "@/lib/social-sync/caption";
import { createFacebookPost, fetchRecentBufferFingerprints } from "@/lib/social-sync/buffer";
import { fingerprint } from "@/lib/social-sync/fingerprint";
import { env } from "@/lib/social-sync/env";

export const runtime = "nodejs";
export const maxDuration = 300;

type Source = "ig" | "tiktok";

type NormalizedPost = {
  source: Source;
  sourceId: string;
  dedupeKey: string;     // "ig:DUW..." / "tiktok:7632..."
  fingerprint: string | null;
  shortRef: string;
  url: string;
  timestamp: string;
  caption: string;
  imageUrls: string[];
  videoUrl?: string;
};

type PostMode = "draft" | "queue" | "now";

type SyncResult = {
  fetched: { ig: number; tiktok: number };
  newPosts: number;
  posted: { source: Source; sourceId: string; bufferId: string; status: string; mode: PostMode }[];
  skipped: { source: Source; sourceId: string; reason: string }[];
};

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${env.cronSecret()}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("sync failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function runSync(): Promise<SyncResult> {
  const runId = await recordRunStart().catch((e) => {
    console.warn("recordRunStart failed (continuing without DB run tracking)", e);
    return null as string | null;
  });

  const [igPosts, ttPosts, seenIds, seenFps, bufferFps] = await Promise.all([
    fetchLatestPosts().catch((e) => { console.error("IG fetch failed", e); return [] as IgPost[]; }),
    fetchLatestTikToks().catch((e) => { console.error("TikTok fetch failed", e); return [] as TikTokPost[]; }),
    getSeenIds(),
    getSeenFingerprints(),
    fetchRecentBufferFingerprints(25).catch((e) => {
      console.warn("Buffer recent-posts fetch failed; skipping that dedupe layer", e);
      return [] as string[];
    }),
  ]);

  const seenFingerprints = new Set([...seenFps, ...bufferFps]);

  const all: NormalizedPost[] = [
    ...igPosts.map(normalizeIg),
    ...ttPosts.map(normalizeTikTok),
  ];

  // Two-layer dedupe + intra-batch fingerprint dedupe (so IG+TikTok of the
  // same post in the SAME run don't both get posted).
  const seenInBatch = new Set<string>();
  const fresh: NormalizedPost[] = [];
  for (const p of all.sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
    if (seenIds.has(p.dedupeKey)) continue;
    if (p.fingerprint && (seenFingerprints.has(p.fingerprint) || seenInBatch.has(p.fingerprint))) continue;
    fresh.push(p);
    if (p.fingerprint) seenInBatch.add(p.fingerprint);
  }

  const result: SyncResult = {
    fetched: { ig: igPosts.length, tiktok: ttPosts.length },
    newPosts: fresh.length,
    posted: [],
    skipped: [],
  };

  const baseMode = env.postMode();
  for (let i = 0; i < fresh.length; i++) {
    const post = fresh[i];
    // 'mixed' mode: first new post fires immediately, rest queue up in
    // Buffer's posting schedule so we don't burst-post and look bot-like.
    const mode =
      baseMode === "mixed" ? (i === 0 ? "now" : "queue") : baseMode;
    try {
      const bufferRes = await processPost(post, mode);
      result.posted.push({
        source: post.source,
        sourceId: post.sourceId,
        bufferId: bufferRes.id,
        status: bufferRes.status,
        mode,
      });
      await recordSyncedPost({
        source: post.source,
        sourceId: post.sourceId,
        fingerprint: post.fingerprint ?? null,
        sourceUrl: post.url,
        sourceCaption: post.caption,
        sourcePostedAt: post.timestamp,
        destinationId: bufferRes.id,
        status: bufferRes.status ?? "sent",
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`Failed to post ${post.dedupeKey}:`, reason);
      result.skipped.push({ source: post.source, sourceId: post.sourceId, reason });
    }
  }

  if (runId) {
    const status: "success" | "partial" | "failed" =
      result.skipped.length === 0
        ? "success"
        : result.posted.length === 0
          ? "failed"
          : "partial";
    await recordRunFinish(runId, {
      fetched: igPosts.length + ttPosts.length,
      posted: result.posted.length,
      skipped: result.skipped.length,
      status,
      details: { posted: result.posted, skipped: result.skipped },
    }).catch((e) => console.warn("recordRunFinish failed", e));
  }

  return result;
}

function normalizeIg(p: IgPost): NormalizedPost {
  const isVideo = p.type === "Video" && !!p.videoUrl;
  const images =
    p.childPosts.length > 0
      ? p.childPosts.filter((c) => c.type !== "Video").map((c) => c.displayUrl)
      : isVideo ? [] : [p.displayUrl];

  return {
    source: "ig",
    sourceId: p.id,
    dedupeKey: `ig:${p.id}`,
    fingerprint: fingerprint(p.caption),
    shortRef: p.shortCode,
    url: p.url,
    timestamp: p.timestamp,
    caption: p.caption,
    imageUrls: images,
    videoUrl: isVideo ? p.videoUrl : undefined,
  };
}

function normalizeTikTok(p: TikTokPost): NormalizedPost {
  return {
    source: "tiktok",
    sourceId: p.id,
    dedupeKey: `tiktok:${p.id}`,
    fingerprint: fingerprint(p.caption),
    shortRef: p.id,
    url: p.url,
    timestamp: p.timestamp,
    caption: p.caption,
    imageUrls: p.videoUrl ? [] : [p.coverUrl],
    videoUrl: p.videoUrl,
  };
}

async function processPost(post: NormalizedPost, mode: PostMode) {
  const text = await rewriteCaption(post.caption, post.timestamp);
  const keyBase = `${post.source}/${post.shortRef}`;

  if (post.videoUrl) {
    // Always archive videos to R2 — this is BOTH our Buffer rehost AND the
    // long-term archive used later by the YouTube cross-post pipeline.
    const archive = await archiveVideo({
      platform: post.source === "ig" ? "instagram" : "tiktok",
      handle: post.source === "ig" ? "88baobao_official" : "88baobao.official",
      externalId: post.sourceId,
      sourceUrl: post.videoUrl,
    });
    return createFacebookPost({ text, videoUrl: archive.publicUrl }, mode);
  }

  const imageUrls: string[] = [];
  for (let i = 0; i < post.imageUrls.length; i++) {
    imageUrls.push(await rehost(post.imageUrls[i], `${keyBase}/image-${i}`));
  }
  return createFacebookPost({ text, imageUrls }, mode);
}
