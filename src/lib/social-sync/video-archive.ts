// Idempotently archive a video to R2 under a stable path. Used both by
// sync-social (so videos are rehosted for Buffer) and as a forward-thinking
// archive for the future YouTube cross-post pipeline.
//
// Naming convention:
//   archive/{platform}/{handle}/{external-id}.mp4
//
// On second invocation the existing object is reused (no re-upload).

import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

let clientCache: S3Client | null = null;
function client(): S3Client {
  if (clientCache) return clientCache;
  clientCache = new S3Client({
    region: "auto",
    endpoint: process.env.R2_S3_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  return clientCache;
}

export type ArchiveInput = {
  platform: "instagram" | "tiktok" | "facebook" | "youtube";
  handle: string;
  externalId: string;
  /** Direct video URL from the source CDN. May be signed/expiring. */
  sourceUrl: string;
};

export type ArchiveResult = {
  publicUrl: string;
  cached: boolean;
  bytes?: number;
};

/**
 * Idempotent video archive. Re-uses an existing object if the same
 * (platform, externalId) was archived before — no re-fetch, no re-upload.
 */
export async function archiveVideo(input: ArchiveInput): Promise<ArchiveResult> {
  const bucket = process.env.R2_BUCKET!;
  const publicBase = process.env.R2_PUBLIC_BASE_URL!.replace(/\/+$/, "");
  const safeHandle = input.handle.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `archive/${input.platform}/${safeHandle}/${input.externalId}.mp4`;
  const publicUrl = `${publicBase}/${key}`;
  const s3 = client();

  // Already archived? Skip the download + upload.
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { publicUrl, cached: true };
  } catch {
    /* not found, proceed */
  }

  const src = await fetch(input.sourceUrl);
  if (!src.ok) {
    throw new Error(`Failed to fetch source video: ${src.status}`);
  }
  const buf = Buffer.from(await src.arrayBuffer());
  const contentType = src.headers.get("content-type") ?? "video/mp4";

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buf,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
      Metadata: {
        "source-platform": input.platform,
        "source-handle": input.handle,
        "source-external-id": input.externalId,
        "archived-at": new Date().toISOString(),
      },
    }),
  );
  return { publicUrl, cached: false, bytes: buf.length };
}
