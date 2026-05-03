import { NextRequest } from "next/server";

/**
 * Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
 * Also accept manual triggers in dev when CRON_SECRET is unset.
 */
export function assertCronAuth(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return; // dev mode
  const header = req.headers.get("authorization");
  if (header !== `Bearer ${secret}`) {
    throw new Error("Unauthorized cron request");
  }
}
