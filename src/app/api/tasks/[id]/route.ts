import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { title, description, priority, status, due_at, tags } = body as {
    title?: string;
    description?: string | null;
    priority?: "low" | "medium" | "high";
    status?: "open" | "in_progress" | "done" | "archived";
    due_at?: string | null;
    tags?: string[];
  };

  const rows = (await sql`
    UPDATE tasks SET
      title        = COALESCE(${title ?? null}, title),
      description  = ${description === undefined ? null : description},
      priority     = COALESCE(${priority ?? null}::task_priority, priority),
      status       = COALESCE(${status ?? null}::task_status, status),
      due_at       = ${due_at === undefined ? null : due_at},
      tags         = COALESCE(${tags ? JSON.stringify(tags) : null}::jsonb, tags),
      completed_at = CASE
        WHEN ${status ?? null} = 'done' AND completed_at IS NULL THEN NOW()
        WHEN ${status ?? null} IN ('open','in_progress') THEN NULL
        ELSE completed_at
      END
    WHERE id = ${id}
    RETURNING id, title, description, priority, status, due_at, created_at, completed_at, tags
  `) as Record<string, unknown>[];
  if (rows.length === 0) {
    return NextResponse.json({ error: "task not found" }, { status: 404 });
  }
  return NextResponse.json({ task: rows[0] });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const rows = (await sql`DELETE FROM tasks WHERE id = ${id} RETURNING id`) as { id: string }[];
  if (rows.length === 0) {
    return NextResponse.json({ error: "task not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
