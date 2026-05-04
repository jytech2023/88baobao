// dev.to internal AI image generation endpoint.
// Free, but session-cookie + CSRF-token authenticated — fragile.
// Cookies live in Doppler:
//   DEVTO_SESSION                — _Devto_Forem_Session, ~30d expiry
//   DEVTO_REMEMBER_USER_TOKEN    — ~6mo expiry
// When cookies expire, the dashboard fetch in step 1 will fail / return a
// login page; callers should fall back to a stable provider.

// Forem exposes the per-session CSRF token at this JSON endpoint (used by
// their own SPA shell). No meta tag is rendered on most pages.
const CSRF_URL = "https://dev.to/async_info/base_data";
const IMAGE_GEN_URL = "https://dev.to/ai_image_generations";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

function cookieHeader(): string {
  const session = process.env.DEVTO_SESSION;
  const remember = process.env.DEVTO_REMEMBER_USER_TOKEN;
  if (!session || !remember) {
    throw new Error("DEVTO_SESSION + DEVTO_REMEMBER_USER_TOKEN must be set");
  }
  return `_Devto_Forem_Session=${session}; remember_user_token=${remember}`;
}

async function fetchCsrfToken(): Promise<string> {
  const res = await fetch(CSRF_URL, {
    headers: {
      "User-Agent": UA,
      "Cookie": cookieHeader(),
      "Accept": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`dev.to base_data fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as { token?: string; user?: string };
  if (!data.token) {
    throw new Error("base_data did not return a token (cookies likely expired)");
  }
  // base_data returns user:"" when signed-out; verify we're logged in.
  if (!data.user) {
    throw new Error("base_data returned no user (cookies expired or invalid)");
  }
  return data.token;
}

export async function generateImageDevto(prompt: string): Promise<string> {
  const csrf = await fetchCsrfToken();
  const res = await fetch(IMAGE_GEN_URL, {
    method: "POST",
    headers: {
      "Accept": "*/*",
      "Content-Type": "application/json",
      "Origin": "https://dev.to",
      "Referer": "https://dev.to/dashboard",
      "User-Agent": UA,
      "Cookie": cookieHeader(),
      "X-CSRF-Token": csrf,
    },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) {
    throw new Error(`dev.to ai_image_generations failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { url?: string };
  if (!data.url) throw new Error("No url returned from dev.to image gen");
  return data.url;
}
