// Dedupe state lives in an Apify named key-value store. Re-uses APIFY_TOKEN
// so we don't need a separate database/KV service.
//
// Tracks two kinds of dedupe markers per post:
//   ids          — `<source>:<source-id>` (catches re-runs on the same post)
//   fingerprints — sha256 of normalized caption text (catches the same content
//                  cross-posted on multiple platforms)

import { env } from "./env";

const STORE_NAME = "88baobao-state";
const RECORD_KEY = "synced-ig-ids";
const MAX_TRACKED = 500;

type State = {
  ids: string[];
  fingerprints?: string[];
  lastRunAt?: string;
};

let storeIdCache: string | null = null;

async function storeId(): Promise<string> {
  if (storeIdCache) return storeIdCache;
  const token = env.apifyToken();
  const res = await fetch(
    `https://api.apify.com/v2/key-value-stores?token=${encodeURIComponent(token)}&name=${encodeURIComponent(STORE_NAME)}`,
    { method: "POST" },
  );
  if (!res.ok) {
    throw new Error(`Failed to get/create KV store: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { data: { id: string } };
  storeIdCache = json.data.id;
  return storeIdCache;
}

async function readState(): Promise<State> {
  const id = await storeId();
  const res = await fetch(
    `https://api.apify.com/v2/key-value-stores/${id}/records/${RECORD_KEY}?token=${encodeURIComponent(env.apifyToken())}`,
  );
  if (res.status === 404) return { ids: [] };
  if (!res.ok) throw new Error(`Read state failed: ${res.status}`);
  return (await res.json()) as State;
}

async function writeState(state: State): Promise<void> {
  const id = await storeId();
  const res = await fetch(
    `https://api.apify.com/v2/key-value-stores/${id}/records/${RECORD_KEY}?token=${encodeURIComponent(env.apifyToken())}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    },
  );
  if (!res.ok) throw new Error(`Write state failed: ${res.status} ${await res.text()}`);
}

export async function getSeenIds(): Promise<Set<string>> {
  const state = await readState();
  return new Set(state.ids);
}

export async function getSeenFingerprints(): Promise<Set<string>> {
  const state = await readState();
  return new Set(state.fingerprints ?? []);
}

export async function recordPosted(
  newIds: string[],
  newFingerprints: string[] = [],
): Promise<void> {
  const current = await readState();
  const ids = Array.from(new Set([...newIds, ...current.ids])).slice(0, MAX_TRACKED);
  const fingerprints = Array.from(
    new Set([...newFingerprints.filter(Boolean), ...(current.fingerprints ?? [])]),
  ).slice(0, MAX_TRACKED);
  await writeState({ ids, fingerprints, lastRunAt: new Date().toISOString() });
}

export async function getLastRunAt(): Promise<string | undefined> {
  const state = await readState();
  return state.lastRunAt;
}
