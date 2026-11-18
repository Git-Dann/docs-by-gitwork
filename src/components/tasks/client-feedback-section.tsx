"use client";

/**
 * What the client said about a task on their wiki Board, in the team's task drawer: their
 * feedback, their sign-off (Approved / Changes needed) and a reply box. A reply is shown to the
 * client on their Board, unlike the drawer's Notes, which stay internal.
 *
 * Shown on product cards always (that's what the client signs off), and on any other task only
 * once the client has said something about it, so a dev task's drawer doesn't grow an empty box.
 */

import { useState } from "react";
import { PreviousValues, SignOffChip } from "@/components/tasks/product-card-parts";
import { useBoardFeedback, useSendBoardFeedback } from "@/hooks/use-wiki-board";
import { BOARD_LIMITS } from "@/lib/wiki-board";
import type { TaskDTO } from "@/types/tasks";

const MONO = { fontFamily: "var(--font-mono)" } as const;

export function ClientFeedbackSection({ task, alwaysShow }: { task: TaskDTO; alwaysShow: boolean }) {
  const target = { mode: "internal" as const, slug: task.client.slug };
  const feedback = useBoardFeedback(target, task.id);
  const send = useSendBoardFeedback(target, task.id);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const entries = feedback.data?.feedback ?? [];
  if (!alwaysShow && entries.length === 0) return null;

  async function reply() {
    if (!body.trim()) {
      setError("Write something first.");
      return;
    }
    setError(null);
    try {
      await send.mutateAsync({ kind: "comment", body });
      setBody("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the reply.");
    }
  }

  return (
    <div>
      <p className="app-eyebrow mb-2 flex items-center gap-2">
        Client feedback <SignOffChip signOff={task.clientSignOff} />
      </p>
      {entries.length === 0 ? (
        <p className="text-[13px] text-[var(--text-4)]">
          The client hasn&apos;t said anything about this yet. They can leave feedback and sign it off from the Board in
          their wiki.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {entries.map((f) => (
            <li key={f.id} className="text-[13px]">
              <p className="text-[11px] text-[var(--text-4)]" style={MONO}>
                {f.side === "team" ? "GITWORK" : "CLIENT"} · {f.authorName} ·{" "}
                {new Date(f.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </p>
              {f.kind === "approved" || f.kind === "changes_requested" ? <SignOffChip signOff={f.kind} className="mt-1" /> : null}
              {f.body ? (
                <p className={f.kind === "change" ? "mt-1 text-[12px] italic text-[var(--text-3)]" : "mt-1 whitespace-pre-wrap text-[var(--text-2)]"}>{f.body}</p>
              ) : null}
              {f.kind === "change" ? <PreviousValues previous={f.previous} /> : null}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          maxLength={BOARD_LIMITS.feedback}
          placeholder="Reply to the client (they'll see this on their Board)…"
          aria-label="Reply to the client"
          className="app-input w-full resize-none px-3 py-2 text-[16px] sm:text-sm"
        />
        {error ? <p className="text-[12px] text-red-700">{error}</p> : null}
        <div className="flex justify-end">
          <button type="button" className="app-button app-button-secondary app-button-sm" disabled={send.isPending} onClick={() => void reply()}>
            {send.isPending ? "Sending…" : "Reply to client"}
          </button>
        </div>
      </div>
    </div>
  );
}
