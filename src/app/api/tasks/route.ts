import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { PROJECT_ID } from "@/lib/project";

const sql = neon(process.env.DATABASE_URL!);

async function projectId(): Promise<string> {
  return PROJECT_ID;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const pid = await projectId();
  const rows = status
    ? await sql`
        SELECT id, title, description, priority, status, due_at, created_at, completed_at, tags
        FROM tasks WHERE project_id = ${pid} AND status = ${status}
        ORDER BY
          CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
          created_at DESC
      `
    : await sql`
        SELECT id, title, description, priority, status, due_at, created_at, completed_at, tags
        FROM tasks WHERE project_id = ${pid}
        ORDER BY
          CASE status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'done' THEN 2 ELSE 3 END,
          CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
          created_at DESC
      `;
  return NextResponse.json({ tasks: rows });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { title, description, priority, due_at, tags } = body as {
    title?: string;
    description?: string;
    priority?: "low" | "medium" | "high";
    due_at?: string | null;
    tags?: string[];
  };
  if (!title || !title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const pid = await projectId();
  const rows = (await sql`
    INSERT INTO tasks (project_id, title, description, priority, due_at, tags)
    VALUES (
      ${pid}, ${title.trim()}, ${description ?? null},
      ${priority ?? "medium"}, ${due_at ?? null},
      ${JSON.stringify(tags ?? [])}
    )
    RETURNING id, title, description, priority, status, due_at, created_at, completed_at, tags
  `) as Record<string, unknown>[];
  return NextResponse.json({ task: rows[0] }, { status: 201 });
}
