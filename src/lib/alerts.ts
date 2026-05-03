import { db } from "@/db/client";
import { alerts } from "@/db/schema";

export type AlertInput = {
  type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body?: string;
  sourceMentionId?: string;
  payload?: Record<string, unknown>;
};

export async function createAlert(input: AlertInput) {
  const channels: string[] = [];

  // Feishu
  const feishu = process.env.FEISHU_WEBHOOK_URL;
  if (feishu) {
    try {
      await fetch(feishu, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          msg_type: "text",
          content: { text: `[${input.severity.toUpperCase()}] ${input.title}\n${input.body ?? ""}` },
        }),
      });
      channels.push("feishu");
    } catch (e) {
      console.error("feishu alert failed", e);
    }
  }

  // Slack
  const slack = process.env.SLACK_WEBHOOK_URL;
  if (slack) {
    try {
      await fetch(slack, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `*[${input.severity.toUpperCase()}] ${input.title}*\n${input.body ?? ""}`,
        }),
      });
      channels.push("slack");
    } catch (e) {
      console.error("slack alert failed", e);
    }
  }

  await db.insert(alerts).values({
    type: input.type,
    severity: input.severity,
    title: input.title,
    body: input.body,
    sourceMentionId: input.sourceMentionId,
    payload: input.payload,
    deliveredChannels: channels,
  });
}
