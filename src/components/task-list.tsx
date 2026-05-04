"use client";

import { useEffect, useState, useTransition } from "react";

type Task = {
  id: string;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high";
  status: "open" | "in_progress" | "done" | "archived";
  due_at: string | null;
  created_at: string;
  completed_at: string | null;
};

type Labels = {
  heading: string;
  empty: string;
  addPlaceholder: string;
  add: string;
  markDone: string;
  delete: string;
  showCompleted: string;
  hideCompleted: string;
};

export function TaskList({ labels }: { labels: Labels }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDone, setShowDone] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftPriority, setDraftPriority] = useState<Task["priority"]>("medium");
  const [, startTransition] = useTransition();

  async function load() {
    const res = await fetch("/api/tasks", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setTasks(data.tasks ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    const title = draft.trim();
    setDraft("");
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, priority: draftPriority }),
    });
    if (res.ok) {
      const data = await res.json();
      setTasks((t) => [data.task, ...t]);
    }
  }

  async function setStatus(id: string, status: Task["status"]) {
    startTransition(() => {
      setTasks((t) =>
        t.map((x) =>
          x.id === id
            ? { ...x, status, completed_at: status === "done" ? new Date().toISOString() : null }
            : x,
        ),
      );
    });
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  async function remove(id: string) {
    setTasks((t) => t.filter((x) => x.id !== id));
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
  }

  const visible = showDone ? tasks : tasks.filter((t) => t.status !== "done" && t.status !== "archived");
  const openCount = tasks.filter((t) => t.status === "open" || t.status === "in_progress").length;
  const doneCount = tasks.filter((t) => t.status === "done").length;

  if (loading) {
    return <div className="text-sm text-black/50 dark:text-white/50">Loading…</div>;
  }

  return (
    <div>
      <form onSubmit={add} className="mb-4 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={labels.addPlaceholder}
          className="flex-1 rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm focus:border-black/30 focus:outline-none dark:border-white/10 dark:focus:border-white/30"
        />
        <select
          value={draftPriority}
          onChange={(e) => setDraftPriority(e.target.value as Task["priority"])}
          className="rounded-lg border border-black/10 bg-transparent px-2 py-2 text-sm dark:border-white/10"
        >
          <option value="low">low</option>
          <option value="medium">med</option>
          <option value="high">high</option>
        </select>
        <button
          type="submit"
          disabled={!draft.trim()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
        >
          {labels.add}
        </button>
      </form>

      {visible.length === 0 ? (
        <p className="text-sm text-black/50 dark:text-white/50">{labels.empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {visible.map((t) => (
            <li key={t.id} className="flex items-start gap-3 py-1">
              <input
                type="checkbox"
                checked={t.status === "done"}
                onChange={(e) => setStatus(t.id, e.target.checked ? "done" : "open")}
                className="mt-1 h-4 w-4 cursor-pointer accent-emerald-600"
              />
              <div className="min-w-0 flex-1">
                <div
                  className={`text-sm ${
                    t.status === "done" ? "text-black/40 line-through dark:text-white/40" : ""
                  }`}
                >
                  {t.title}
                </div>
                {t.description && (
                  <div className="text-xs text-black/50 dark:text-white/50">{t.description}</div>
                )}
              </div>
              <PriorityBadge priority={t.priority} />
              <button
                onClick={() => remove(t.id)}
                aria-label={labels.delete}
                className="text-xs text-black/30 hover:text-red-500 dark:text-white/30"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {doneCount > 0 && (
        <button
          onClick={() => setShowDone((v) => !v)}
          className="mt-3 text-xs text-black/40 hover:text-black/70 dark:text-white/40 dark:hover:text-white/70"
        >
          {showDone ? labels.hideCompleted : `${labels.showCompleted} (${doneCount})`}
        </button>
      )}

      {openCount === 0 && doneCount > 0 && !showDone && (
        <p className="mt-3 text-xs text-emerald-600 dark:text-emerald-400">All done ✨</p>
      )}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: Task["priority"] }) {
  const cls =
    priority === "high"
      ? "bg-red-500/15 text-red-600 dark:text-red-400"
      : priority === "medium"
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        : "bg-black/5 text-black/50 dark:bg-white/10 dark:text-white/50";
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${cls}`}>
      {priority}
    </span>
  );
}
