function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  apifyToken: () => required("APIFY_TOKEN"),
  bufferApiKey: () => required("BUFFER_API_KEY"),
  bufferChannelId: () => required("BUFFER_CHANNEL_ID"),
  bufferOrganizationId: () => required("BUFFER_ORGANIZATION_ID"),
  igUsername: () => optional("IG_USERNAME"),
  igFetchLimit: () => Number(optional("IG_FETCH_LIMIT", "10")),
  tiktokUsername: () => optional("TIKTOK_USERNAME"),
  tiktokFetchLimit: () => Number(optional("TIKTOK_FETCH_LIMIT", "10")),
  cronSecret: () => required("CRON_SECRET"),
  postMode: () => (optional("POST_MODE", "queue") as "draft" | "queue" | "now"),
  throwbackDays: () => Number(optional("THROWBACK_DAYS", "14")),
  aiGatewayApiKey: () => optional("AI_GATEWAY_API_KEY"),

  r2AccessKeyId: () => required("R2_ACCESS_KEY_ID"),
  r2SecretAccessKey: () => required("R2_SECRET_ACCESS_KEY"),
  r2Endpoint: () => required("R2_S3_ENDPOINT"),
  r2Bucket: () => required("R2_BUCKET"),
  r2PublicBaseUrl: () => required("R2_PUBLIC_BASE_URL"),
};
