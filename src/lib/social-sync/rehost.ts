// Buffer can't fetch Instagram CDN URLs (signed/IP-bound), so we download the
// media and re-upload it to Cloudflare R2 on a public bucket. Buffer fetches
// the asset once at post-creation, so the R2 object is only needed briefly —
// but R2 storage is cheap, so we just keep them.

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { env } from "./env";

let clientCache: S3Client | null = null;

function client(): S3Client {
  if (clientCache) return clientCache;
  clientCache = new S3Client({
    region: "auto",
    endpoint: env.r2Endpoint(),
    credentials: {
      accessKeyId: env.r2AccessKeyId(),
      secretAccessKey: env.r2SecretAccessKey(),
    },
  });
  return clientCache;
}

export async function rehost(sourceUrl: string, keyPrefix: string): Promise<string> {
  const src = await fetch(sourceUrl);
  if (!src.ok) {
    throw new Error(`Failed to fetch source media: ${src.status}`);
  }
  const buf = Buffer.from(await src.arrayBuffer());
  const contentType = src.headers.get("content-type") ?? "application/octet-stream";
  const ext = extFor(contentType);
  const key = `${keyPrefix}.${ext}`;

  await client().send(
    new PutObjectCommand({
      Bucket: env.r2Bucket(),
      Key: key,
      Body: buf,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  const base = env.r2PublicBaseUrl().replace(/\/+$/, "");
  return `${base}/${key}`;
}

function extFor(mime: string): string {
  if (mime.includes("jpeg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("mp4") || mime.includes("video")) return "mp4";
  return "bin";
}
