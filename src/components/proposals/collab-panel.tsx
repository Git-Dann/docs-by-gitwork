/**
 * Editor-side collaboration widget: presence bubbles + comment threads + version snapshots.
 * Lives below SignaturePanel in the proposal editor. Keeps the surface compact — three small
 * sections under one widget header.
 */

"use client";

import { useState } from "react";
import { CheckCircleIcon, ChatBubbleLeftRightIcon, ClockIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";
import {
  useCreateDocumentVersion,
  useCreateWorkspaceComment,
  useDocumentComments,
  useDocumentVersions,
  useEditorPresence,
  useToggleCommentResolved,
} from "@/hooks/use-document-collab";

interface CollabPanelProps {
  documentId: string;
  currentVersion: string;
}

export function CollabPanel({ documentId, currentVersion }: CollabPanelProps) {
  const presence = useEditorPresence(documentId);
  const commentsQuery = useDocumentComments(documentId);
  const versionsQuery = useDocumentVersions(documentId);
  const createComment = useCreateWorkspaceComment(documentId);
  const toggleResolved = useToggleCommentResolved(documentId);
  const createVersion = useCreateDocumentVersion(documentId);

  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [composer, setComposer] = useState("");
  const [versionLabel, setVersionLabel] = useState(bumpPatch(currentVersion));
  const [versionChangelog, setVersionChangelog] = useState("");
  const [versionOpen, setVersionOpen] = useState(false);

  const comments = commentsQuery.data ?? [];
  const topLevel = comments.filter((c) => c.parentId === null);
  const openCount = topLevel.filter((c) => c.status === "OPEN").length;
  const versions = versionsQuery.data ?? [];

  async function handleSubmitComment() {
    if (composer.trim().length === 0) return;
    await createComment.mutateAsync({
      body: composer,
      parentId: replyTo,
    });
    setComposer("");
    setReplyTo(null);
  }

  async function handleCreateVersion() {
    if (!versionLabel.trim()) return;
    await createVersion.mutateAsync({
      version: versionLabel.trim(),
      changelog: versionChangelog.trim() || undefined,
    });
    setVersionLabel(bumpPatch(versionLabel.trim()));
    setVersionChangelog("");
    setVersionOpen(false);
  }

  return (
    <section className="widget-card overflow-hidden">
      <div className="widget-header">
        <span className="widget-header-label">COLLABORATION</span>
        <span className="widget-header-right">
          {openCount} OPEN · {versions.length} VERSION{versions.length === 1 ? "" : "S"}
        </span>
      </div>

      <div className="space-y-6 p-5 sm:p-6">
        {/* Presence */}
        {presence.length > 0 ? (
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
              Editing now
            </p>
            <div className="mt-2 flex -space-x-2">
              {presence.slice(0, 6).map((p) => (
                <div
                  key={p.sessionId}
                  title={p.userName}
                  className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[var(--brand-600)] text-[10px] font-semibold uppercase text-white shadow-[var(--shadow-xs)]"
                >
                  {initials(p.userName)}
                </div>
              ))}
              {presence.length > 6 ? (
                <span className="ml-2 text-xs text-[var(--text-3)]">+{presence.length - 6} more</span>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Comments */}
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
            <ChatBubbleLeftRightIcon className="inline h-3.5 w-3.5 -mt-0.5 mr-1" />
            Comments
          </p>

          {topLevel.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--text-3)]">
              No comments yet. When viewers leave a comment on the public link, they appear here —
              you can also add internal team notes from the composer below.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {topLevel.slice(0, 8).map((comment) => (
                <li
                  key={comment.id}
                  className={cn(
                    "rounded-[10px] border px-4 py-3 text-sm",
                    comment.status === "RESOLVED"
                      ? "border-[var(--border-3)] bg-[var(--surface-1)] opacity-70"
                      : "border-[var(--border-2)] bg-white",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-medium text-[var(--text-1)]">
                      {comment.authorName}
                      <span className="ml-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                        {comment.authorKind === "PUBLIC" ? "PUBLIC" : "WORKSPACE"}
                      </span>
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        toggleResolved.mutate({
                          commentId: comment.id,
                          resolved: comment.status === "OPEN",
                        })
                      }
                      className="text-[11px] text-[var(--text-4)] hover:text-[var(--text-2)]"
                    >
                      {comment.status === "OPEN" ? "Resolve" : "Reopen"}
                    </button>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-[var(--text-2)]">{comment.body}</p>
                  <p className="mt-2 text-[11px] text-[var(--text-4)]">
                    {new Date(comment.createdAt).toLocaleString()}
                  </p>
                  {(comment.replies ?? []).length > 0 ? (
                    <ul className="mt-3 space-y-2 border-l-2 border-[var(--border-3)] pl-4">
                      {comment.replies!.map((reply) => (
                        <li key={reply.id} className="text-sm">
                          <p className="font-medium text-[var(--text-2)]">{reply.authorName}</p>
                          <p className="mt-1 whitespace-pre-wrap text-[var(--text-3)]">{reply.body}</p>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                    className="mt-2 text-[11px] font-medium text-[var(--brand-700)] hover:underline"
                  >
                    {replyTo === comment.id ? "Cancel reply" : "Reply"}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 space-y-2">
            <textarea
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              placeholder={replyTo ? "Type your reply…" : "Add an internal note for the team…"}
              className="app-textarea"
              rows={2}
              maxLength={4000}
            />
            <div className="flex justify-end">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleSubmitComment}
                disabled={composer.trim().length === 0}
                loading={createComment.isPending}
              >
                {replyTo ? "Post reply" : "Post comment"}
              </Button>
            </div>
          </div>
        </div>

        {/* Versions */}
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
            <ClockIcon className="inline h-3.5 w-3.5 -mt-0.5 mr-1" />
            Versions
          </p>

          {versions.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--text-3)]">
              No versions saved yet. Snapshot the current document state when you ship a milestone
              so you can diff later.
            </p>
          ) : (
            <ul className="mt-2 space-y-1">
              {versions.slice(0, 6).map((v) => (
                <li
                  key={v.id}
                  className="flex items-baseline justify-between gap-2 rounded-[6px] border border-[var(--border-3)] bg-white px-3 py-2 text-sm"
                >
                  <span className="font-mono text-[12px] font-semibold text-[var(--text-1)]">{v.version}</span>
                  <span className="flex-1 truncate text-[var(--text-3)]">
                    {v.changelog ?? "—"}
                  </span>
                  <span className="text-[11px] text-[var(--text-4)]">
                    {new Date(v.createdAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {!versionOpen ? (
            <button
              type="button"
              onClick={() => setVersionOpen(true)}
              className="mt-3 inline-flex items-center text-sm font-medium text-[var(--brand-700)] hover:underline"
            >
              + Save current state as version
            </button>
          ) : (
            <div className="mt-3 space-y-2 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4">
              <label className="block text-sm">
                <span className="text-xs font-medium text-[var(--text-2)]">Version label</span>
                <input
                  value={versionLabel}
                  onChange={(e) => setVersionLabel(e.target.value)}
                  className="app-input mt-1"
                  placeholder="v1.1"
                  maxLength={40}
                />
              </label>
              <label className="block text-sm">
                <span className="text-xs font-medium text-[var(--text-2)]">Changelog</span>
                <textarea
                  value={versionChangelog}
                  onChange={(e) => setVersionChangelog(e.target.value)}
                  className="app-textarea mt-1"
                  rows={2}
                  placeholder="What changed in this version?"
                  maxLength={2000}
                />
              </label>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="tertiary"
                  size="sm"
                  onClick={() => setVersionOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleCreateVersion}
                  loading={createVersion.isPending}
                  disabled={!versionLabel.trim()}
                  leadingIcon={<CheckCircleIcon className="h-3.5 w-3.5" />}
                >
                  Snapshot
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function bumpPatch(version: string): string {
  // Best-effort version bump: "v1.0" -> "v1.1", "v1.1" -> "v1.2", "1.0.0" -> "1.0.1"
  const match = version.match(/^(.*?)(\d+)$/);
  if (!match) return `${version}.1`;
  return `${match[1]}${parseInt(match[2], 10) + 1}`;
}
