"use client";

import { ChatBubbleLeftRightIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { useDispatchAvailable } from "@/hooks/use-dispatch";
import { openDispatch } from "@/lib/dispatch/open";

/** Small "Ask Dispatch about this client" icon, for client headers and My Clients rows. */
export function AskDispatchIcon({ clientSlug, clientName }: { clientSlug: string; clientName: string }) {
  const available = useDispatchAvailable();
  if (!available) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openDispatch({ clientSlug });
      }}
      title={`Ask Dispatch about ${clientName}`}
      aria-label={`Ask Dispatch about ${clientName}`}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] text-[var(--text-3)] transition hover:bg-[var(--surface-1)] hover:text-[var(--brand-700)]"
    >
      <ChatBubbleLeftRightIcon className="h-4 w-4" />
    </button>
  );
}

/** ✦ on a task: opens Dispatch on the task's client, with the task's quick actions. */
export function AskDispatchAboutTask({ clientSlug, taskId }: { clientSlug: string; taskId: string }) {
  const available = useDispatchAvailable();
  if (!available) return null;
  return (
    <button
      type="button"
      onClick={() => openDispatch({ clientSlug, taskId })}
      title="Ask Dispatch about this task"
      aria-label="Ask Dispatch about this task"
      className="shrink-0 rounded-[6px] p-1 text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--brand-700)]"
    >
      <SparklesIcon className="h-5 w-5" />
    </button>
  );
}
