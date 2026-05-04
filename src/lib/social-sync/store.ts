// Dedupe state + run history live in Postgres now (synced_posts + sync_runs).
// Previously this lived in an Apify KV store; that's left in place but no
// longer read or written.
//
// Dedupe markers per post:
//   ids          — `<source>:<source-id>` (catches re-runs on the same post)
//   fingerprints — sha256 of normalized caption text (catches the same content
//                  cross-posted on multiple platforms)

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);
const PROJECT_SLUG = "88baobao";

let projectIdCache: string | null = null;

async function projectId(): Promise<string> {
  if (projectIdCache) return projectIdCache;
  const rows = (await sql`
    SELECT id FROM projects WHERE slug = ${PROJECT_SLUG} LIMIT 1
  `) as { id: string }[];
  if (rows.length === 0) throw new Error(`project '${PROJECT_SLUG}' not found`);
  projectIdCache = rows[0].id;
  return projectIdCache;
}

export async function getSeenIds(): Promise<Set<string>> {
  const pid = await projectId();
  const rows = (await sql`
    SELECT source_platform, source_id FROM synced_posts WHERE project_id = ${pid}
  `) as { source_platform: string; source_id: string }[];
  return new Set(rows.map((r) => `${r.source_platform}:${r.source_id}`));
}

export async function getSeenFingerprints(): Promise<Set<string>> {
  const pid = await projectId();
  const rows = (await sql`
    SELECT fingerprint FROM synced_posts
    WHERE project_id = ${pid} AND fingerprint IS NOT NULL
  `) as { fingerprint: string | null }[];
  return new Set(rows.map((r) => r.fingerprint).filter((f): f is string => !!f));
}

export type SyncedPostInput = {
  source: "ig" | "tiktok";
  sourceId: string;
  fingerprint?: string | null;
  sourceUrl?: string | null;
  sourceCaption?: string | null;
  sourcePostedAt?: string | null;
  destinationId?: string | null;
  destinationCaption?: string | null;
  status?: string | null;
};

const PLATFORM_MAP: Record<string, string> = {
  ig: "instagram",
  tiktok: "tiktok",
};

export async function recordSyncedPost(input: SyncedPostInput): Promise<void> {
  const pid = await projectId();
  const platform = PLATFORM_MAP[input.source] ?? input.source;
  await sql`
    INSERT INTO synced_posts (
      project_id, source_platform, source_id, fingerprint,
      source_url, source_caption, source_posted_at,
      destination_id, destination_caption, status
    ) VALUES (
      ${pid}, ${platform}, ${input.sourceId}, ${input.fingerprint ?? null},
      ${input.sourceUrl ?? null}, ${input.sourceCaption ?? null}, ${input.sourcePostedAt ?? null},
      ${input.destinationId ?? null}, ${input.destinationCaption ?? null}, ${input.status ?? "sent"}
    )
    ON CONFLICT (project_id, source_platform, source_id) DO NOTHING
  `;
}

// ---------- sync_runs lifecycle ----------

export async function recordRunStart(): Promise<string> {
  const pid = await projectId();
  const rows = (await sql`
    INSERT INTO sync_runs (project_id, status) VALUES (${pid}, 'running')
    RETURNING id
  `) as { id: string }[];
  return rows[0].id;
}

export async function recordRunFinish(
  runId: string,
  result: {
    fetched: number;
    posted: number;
    skipped: number;
    status: "success" | "partial" | "failed";
    errorMessage?: string | null;
    details?: unknown;
  },
): Promise<void> {
  await sql`
    UPDATE sync_runs
    SET finished_at = NOW(),
        fetched_count = ${result.fetched},
        posted_count = ${result.posted},
        skipped_count = ${result.skipped},
        status = ${result.status},
        error_message = ${result.errorMessage ?? null},
        details = ${result.details ? JSON.stringify(result.details) : null}
    WHERE id = ${runId}
  `;
}

// ---------- legacy compat ----------

/**
 * @deprecated Use recordSyncedPost / recordRunFinish for richer per-post data.
 *   Kept for backwards-compat with older callers; only writes the dedupe key,
 *   not the full row, so dashboard activity will be sparse if used alone.
 */
export async function recordPosted(
  newIds: string[],
  newFingerprints: string[] = [],
): Promise<void> {
  const pid = await projectId();
  for (let i = 0; i < newIds.length; i++) {
    const [src, id] = newIds[i].split(":");
    if (!src || !id) continue;
    const platform = PLATFORM_MAP[src] ?? src;
    const fp = newFingerprints[i] ?? null;
    await sql`
      INSERT INTO synced_posts (project_id, source_platform, source_id, fingerprint, status)
      VALUES (${pid}, ${platform}, ${id}, ${fp}, 'sent')
      ON CONFLICT (project_id, source_platform, source_id) DO NOTHING
    `;
  }
}

export async function getLastRunAt(): Promise<string | undefined> {
  const pid = await projectId();
  const rows = (await sql`
    SELECT started_at FROM sync_runs
    WHERE project_id = ${pid} ORDER BY started_at DESC LIMIT 1
  `) as { started_at: Date }[];
  return rows[0]?.started_at ? new Date(rows[0].started_at).toISOString() : undefined;
}
