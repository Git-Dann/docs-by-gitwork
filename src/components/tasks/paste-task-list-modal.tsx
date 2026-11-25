"use client";

/**
 * "Paste a list": one task per line, all created on this client in one go, with the same
 * assignee, category, release and status. Bullets and numbering are stripped
 * (src/lib/tasks/task-csv.ts). It creates through the CSV import route, so it follows the same
 * rules: an assignee, category or release that isn't this client's is dropped, never written.
 */

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useBackstageTeam } from "@/hooks/use-backstage";
import { useImportTasks } from "@/hooks/use-tasks";
import { isAtLeast } from "@/types/auth";
import { parseTaskList } from "@/lib/tasks/task-csv";
import { releaseLabel } from "@/lib/tasks/releases";
import { TASK_STATUSES, TASK_STATUS_LABELS, type TaskStatus } from "@/types/tasks";

const LABEL = "mb-1 block text-xs font-medium text-[var(--text-2)]";

export function PasteTaskListModal({
  slug,
  clientId,
  blocks,
  releases,
  onClose,
  onDone,
}: {
  slug: string;
  clientId: string;
  blocks: { id: string; name: string }[];
  releases: { id: string; version: string; name: string | null }[];
  onClose: () => void;
  onDone: (created: number) => void;
}) {
  const team = useBackstageTeam();
  // Same scoping as the task form: devs on this client, plus admins.
  const members = (team.data ?? []).filter(
    (m) => isAtLeast(m.role, "ADMIN") || m.assignedClientIds.includes(clientId),
  );
  const create = useImportTasks();

  const [text, setText] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [blockId, setBlockId] = useState("");
  const [releaseId, setReleaseId] = useState("");
  const [status, setStatus] = useState<TaskStatus>("TODO");
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parseTaskList(text), [text]);
  const n = parsed.titles.length;

  async function submit() {
    if (n === 0) return;
    setError(null);
    try {
      const res = await create.mutateAsync({
        slug,
        tasks: parsed.titles.map((title) => ({
          title,
          status,
          assigneeIds: assigneeId ? [assigneeId] : undefined,
          featureBlockId: blockId || undefined,
          releaseId: releaseId || undefined,
        })),
      });
      onDone(res.created);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Those tasks didn't save. Try again.");
    }
  }

  return (
    <Modal open onClose={onClose} title="Paste a list of tasks" panelClassName="app-dialog-fixed w-full max-w-3xl">
      <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 md:grid-cols-[minmax(0,1fr)_240px] md:overflow-hidden">
        <div className="flex min-h-[220px] flex-col md:min-h-0">
          <label htmlFor="paste-list" className={LABEL}>
            One task per line
          </label>
          <textarea
            id="paste-list"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Fix login on iOS\nAdd export to the reports page\n- Bullets and numbering are fine"}
            className="app-input min-h-0 w-full flex-1 resize-none px-3 py-2 font-mono text-[16px] leading-6 sm:text-[13px]"
          />
          <p className="mt-1.5 text-[11px] text-[var(--text-4)]">
            {n === 0 ? "Blank lines are skipped." : `${n} ${n === 1 ? "task" : "tasks"} will be created.`}
            {parsed.shortened > 0 ? ` ${parsed.shortened} long ${parsed.shortened === 1 ? "line was" : "lines were"} shortened to 200 characters.` : ""}
            {parsed.overLimit > 0 ? ` ${parsed.overLimit} past the first 1,000 left out.` : ""}
          </p>
        </div>

        <div className="space-y-3 md:min-h-0 md:overflow-y-auto">
          <p className="text-[11px] text-[var(--text-4)]">Applied to every task in the list.</p>
          <div>
            <label htmlFor="paste-status" className={LABEL}>Status</label>
            <select id="paste-status" className="app-select w-full" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="paste-assignee" className={LABEL}>Assignee</label>
            <select id="paste-assignee" className="app-select w-full" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="paste-category" className={LABEL}>Category</label>
            <select id="paste-category" className="app-select w-full" value={blockId} onChange={(e) => setBlockId(e.target.value)}>
              <option value="">No category</option>
              {blocks.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          {releases.length > 0 ? (
            <div>
              <label htmlFor="paste-release" className={LABEL}>Release</label>
              <select id="paste-release" className="app-select w-full" value={releaseId} onChange={(e) => setReleaseId(e.target.value)}>
                <option value="">No release</option>
                {releases.map((r) => (
                  <option key={r.id} value={r.id}>{releaseLabel(r)}</option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--border-2)] px-5 py-4">
        <span className="min-w-0 truncate text-xs font-medium text-rose-600" title={error ?? undefined}>
          {error}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={() => void submit()} loading={create.isPending} disabled={n === 0}>
            {n === 0 ? "Create tasks" : `Create ${n} ${n === 1 ? "task" : "tasks"}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
