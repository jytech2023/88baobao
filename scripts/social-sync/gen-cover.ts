// Generate a cover image and attach it to a dev.to article.
//
// Pipeline: image-gen wrapper → bytes → upload to R2 → PUT main_image.
// The wrapper picks the cheapest working provider (Pollinations → dev.to → AI Gateway).
//
// Usage:
//   doppler run -- npx tsx scripts/social-sync/gen-cover.ts <article-id> [prompt]

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { generateImage } from "../../src/lib/image-gen";

const articleId = process.argv[2];
if (!articleId) {
  console.error("Usage: gen-cover.ts <devto-article-id> [prompt]");
  process.exit(1);
}

const DEFAULT_PROMPT = [
  "Minimalist editorial illustration for a software engineering article.",
  "Subject: an automated content pipeline that moves social-media posts between platforms.",
  "Three abstract source/destination nodes connected by elegant flowing data streams,",
  "with a subtle central transformation node implying AI processing.",
  "Style: clean flat vector, isometric perspective, soft gradients (deep indigo, teal, warm orange accents).",
  "Subtle grid background. Calm, technical, premium mood. Negative space.",
  "No text, no logos, no recognizable brand marks. No people.",
].join(" ");

const prompt = process.argv[3] ?? DEFAULT_PROMPT;

(async () => {
  console.log("Generating image…");
  const r = await generateImage({ prompt });
  console.log(`  source: ${r.source}  bytes: ${r.bytes.length}  contentType: ${r.contentType}`);

  const ext = r.contentType.includes("png") ? "png" : r.contentType.includes("jpeg") ? "jpg" : "bin";
  const key = `devto/cover-${Date.now()}.${ext}`;
  const s3 = new S3Client({
    region: "auto",
    endpoint: process.env.R2_S3_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
      Body: Buffer.from(r.bytes),
      ContentType: r.contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  const coverUrl = `${process.env.R2_PUBLIC_BASE_URL!.replace(/\/+$/, "")}/${key}`;
  console.log(`  rehosted: ${coverUrl}`);

  console.log(`Updating dev.to article ${articleId}…`);
  const res = await fetch(`https://dev.to/api/articles/${articleId}`, {
    method: "PUT",
    headers: {
      "api-key": process.env.DEVTO_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ article: { main_image: coverUrl } }),
  });
  if (!res.ok) {
    console.error("dev.to update failed:", res.status, await res.text());
    process.exit(1);
  }
  const out = (await res.json()) as { id: number; cover_image: string; title: string };
  console.log(`✓ Article "${out.title}"`);
  console.log(`  cover: ${out.cover_image}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
