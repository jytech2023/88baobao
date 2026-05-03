import { env } from "./env";
import { fingerprint } from "./fingerprint";

const BUFFER_API = "https://api.buffer.com/2/graphql";

type ShareMode = "shareNow" | "addToQueue" | "shareNext" | "customScheduled" | "recommendedTime";

export type BufferPostInput = {
  text: string;
  imageUrls?: string[];
  videoUrl?: string;
};

export type BufferPostResult = {
  id: string;
  status: string;
  dueAt?: string | null;
};

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(BUFFER_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.bufferApiKey()}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`Buffer HTTP ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new Error(`Buffer GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  return json.data as T;
}

export async function createFacebookPost(input: BufferPostInput): Promise<BufferPostResult> {
  const mode = env.postMode();
  const { shareMode, saveToDraft } = modeFor(mode);

  const assets: Record<string, unknown> = {};
  if (input.imageUrls?.length) {
    assets.images = input.imageUrls.map((url) => ({ url }));
  }
  if (input.videoUrl) {
    assets.videos = [{ url: input.videoUrl }];
  }

  const variables = {
    input: {
      channelId: env.bufferChannelId(),
      text: input.text,
      schedulingType: "automatic",
      mode: shareMode,
      saveToDraft,
      metadata: { facebook: { type: "post" } },
      ...(Object.keys(assets).length ? { assets } : {}),
    },
  };

  const data = await gql<{ createPost: BufferCreatePayload }>(MUTATION, variables);
  const r = data.createPost;
  if (r.__typename === "PostActionSuccess" && r.post) {
    return { id: r.post.id, status: r.post.status, dueAt: r.post.dueAt ?? null };
  }
  throw new Error(`Buffer createPost ${r.__typename}: ${r.message ?? "(no message)"}`);
}

function modeFor(mode: "draft" | "queue" | "now"): { shareMode: ShareMode; saveToDraft: boolean } {
  switch (mode) {
    case "draft": return { shareMode: "addToQueue", saveToDraft: true };
    case "queue": return { shareMode: "addToQueue", saveToDraft: false };
    case "now":   return { shareMode: "shareNow",   saveToDraft: false };
  }
}

// Fetches recent posts on the connected channel and returns their content
// fingerprints. Used to dedupe against posts created outside the cron (manual
// Buffer drafts, other tools).
export async function fetchRecentBufferFingerprints(limit = 25): Promise<string[]> {
  const data = await gql<{ posts: { edges: { node: { text: string | null } }[] } }>(
    RECENT_QUERY,
    {
      input: {
        organizationId: env.bufferOrganizationId(),
        filter: { channelIds: [env.bufferChannelId()] },
        sort: [{ field: "createdAt", direction: "desc" }],
      },
      first: limit,
    },
  );
  const fps = data.posts.edges
    .map((e) => fingerprint(e.node.text ?? ""))
    .filter((fp): fp is string => fp !== null);
  return fps;
}

type BufferCreatePayload = {
  __typename: string;
  post?: { id: string; status: string; dueAt?: string | null };
  message?: string;
};

const MUTATION = `
  mutation Create($input: CreatePostInput!) {
    createPost(input: $input) {
      __typename
      ... on PostActionSuccess { post { id status dueAt } }
      ... on InvalidInputError { message }
      ... on UnauthorizedError { message }
      ... on RestProxyError { message }
      ... on UnexpectedError { message }
      ... on LimitReachedError { message }
      ... on NotFoundError { message }
    }
  }
`;

const RECENT_QUERY = `
  query Recent($input: PostsInput!, $first: Int) {
    posts(input: $input, first: $first) {
      edges { node { text } }
    }
  }
`;
