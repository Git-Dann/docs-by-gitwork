/**
 * AI Chat side panel (P2.9). Persistent right-edge slide-in that holds a conversation with the
 * AI assistant. The AI can:
 *   - Answer questions in prose
 *   - Propose section-level changes via the propose_change tool; user accepts / rejects
 *   - Propose a full-doc draft via propose_document_draft; user accepts / rejects per section
 *
 * Conversation state lives in component state — server is stateless. Each turn sends the full
 * message history. Proposals are NOT applied until the user clicks Accept.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { PaperAirplaneIcon, SparklesIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { DiffView } from "@/components/proposals/diff-view";
import { apiFetch } from "@/lib/api";
import { SECTION_REGISTRY } from "@/lib/sections/registry";
import type { ProposalDocument, SectionKey } from "@/types/proposal";

interface AiChatPanelProps {
  open: boolean;
  onClose: () => void;
  documentId: string;
  /** Called after the user accepts a proposal — gives caller a chance to refresh local draft. */
  onAfterApply: (proposal: ProposalDocument) => void;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** When role === "assistant", the assistant may have produced one or more proposed changes. */
  proposals?: Array<{
    id: string;
    sectionKey: string;
    before: unknown;
    after: unknown;
    summary: string;
    status: "pending" | "applied" | "rejected";
  }>;
}

function mkId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10);
}

interface PulseScanListItem {
  id: string;
  projectName: string;
  inputUrl: string | null;
  inputGithubRepo: string | null;
}

export function AiChatPanel({ open, onClose, documentId, onAfterApply }: AiChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [composer, setComposer] = useState("");
  const [pulseScanId, setPulseScanId] = useState<string>("");
  const [scans, setScans] = useState<PulseScanListItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Lazy-load Pulse scans for the picker
  useEffect(() => {
    if (!open || scans.length > 0) return;
    void apiFetch<{ scans: PulseScanListItem[] }>("/api/pulse/scans?limit=25")
      .then((res) => setScans(res.scans ?? []))
      .catch(() => {
        // Silent — Pulse picker just won't appear
      });
  }, [open, scans.length]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Escape key closes the panel
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function handleSubmit() {
    const text = composer.trim();
    if (!text || submitting) return;

    const userMessage: ChatMessage = { id: mkId(), role: "user", content: text };
    const conversationForServer = [
      ...messages.map(({ role, content }) => ({ role, content })),
      { role: "user" as const, content: text },
    ];
    setMessages((prev) => [...prev, userMessage]);
    setComposer("");
    setSubmitting(true);
    setError(null);

    try {
      const res = await apiFetch<{
        reply: string;
        proposals: Array<{
          sectionKey: string;
          before: unknown;
          after: unknown;
          summary: string;
        }>;
      }>(`/api/documents/${documentId}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: conversationForServer,
          pulseScanId: pulseScanId || undefined,
        }),
      });

      const assistantMessage: ChatMessage = {
        id: mkId(),
        role: "assistant",
        content: res.reply,
        proposals: res.proposals.map((p) => ({ ...p, id: mkId(), status: "pending" as const })),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAccept(messageId: string, proposalId: string) {
    const message = messages.find((m) => m.id === messageId);
    const proposal = message?.proposals?.find((p) => p.id === proposalId);
    if (!proposal) return;

    try {
      const res = await apiFetch<{ proposal: ProposalDocument }>(
        `/api/documents/${documentId}/ai/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sectionKey: proposal.sectionKey, after: proposal.after }),
        },
      );
      // Mark as applied in the UI
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                proposals: m.proposals?.map((p) =>
                  p.id === proposalId ? { ...p, status: "applied" } : p,
                ),
              }
            : m,
        ),
      );
      onAfterApply(res.proposal);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function handleReject(messageId: string, proposalId: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              proposals: m.proposals?.map((p) =>
                p.id === proposalId ? { ...p, status: "rejected" } : p,
              ),
            }
          : m,
      ),
    );
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close AI chat"
        onClick={onClose}
        className="absolute inset-0 bg-black/20"
      />
      {/* Slide-in panel */}
      <aside
        className="absolute inset-y-0 right-0 flex w-full max-w-[440px] flex-col bg-white shadow-[var(--shadow-lg)]"
        role="dialog"
        aria-label="AI assistant"
      >
        {/* Header */}
        <div className="widget-header">
          <span className="widget-header-label">AI ASSISTANT</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--text-4)] transition hover:text-[var(--text-1)]"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Conversation thread */}
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <div className="space-y-3 text-sm text-[var(--text-3)]">
              <div className="flex items-center gap-2 text-[var(--brand-700)]">
                <SparklesIcon className="h-5 w-5" />
                <span className="font-medium">Talk to the assistant.</span>
              </div>
              <p>
                Ask for a full draft, a rewrite of a single section, or feedback on tone.
                Proposed changes show as a diff — accept what you want, reject the rest.
              </p>
              <div className="rounded-[8px] border border-dashed border-[var(--border-2)] p-3">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                  Try
                </p>
                <ul className="mt-2 space-y-1 text-[13px] text-[var(--text-2)]">
                  <li>· &ldquo;Draft a proposal for a Next.js platform for Acme&rdquo;</li>
                  <li>· &ldquo;Make the introduction more concise&rdquo;</li>
                  <li>· &ldquo;Add a third timeline phase for QA&rdquo;</li>
                </ul>
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className="space-y-2">
                <div
                  className={
                    m.role === "user"
                      ? "ml-6 rounded-[10px] bg-[var(--brand-200)] px-3 py-2 text-sm text-[var(--text-1)]"
                      : "mr-6 text-sm text-[var(--text-2)]"
                  }
                >
                  {m.role === "assistant" ? (
                    <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-700)]">
                      Assistant
                    </p>
                  ) : null}
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
                {m.proposals?.map((p) => (
                  <div key={p.id} className="mr-6 space-y-2">
                    <div className="flex items-baseline justify-between">
                      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-700)]">
                        PROPOSAL · {SECTION_REGISTRY[p.sectionKey as SectionKey]?.displayName ?? p.sectionKey}
                      </p>
                      <span
                        className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em]"
                        style={{
                          color:
                            p.status === "applied"
                              ? "var(--success-500)"
                              : p.status === "rejected"
                                ? "var(--text-4)"
                                : "var(--text-3)",
                        }}
                      >
                        {p.status === "applied"
                          ? "APPLIED"
                          : p.status === "rejected"
                            ? "REJECTED"
                            : "PENDING"}
                      </span>
                    </div>
                    <DiffView before={p.before} after={p.after} summary={p.summary} />
                    {p.status === "pending" ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="tertiary"
                          size="sm"
                          onClick={() => handleReject(m.id, p.id)}
                        >
                          Reject
                        </Button>
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={() => handleAccept(m.id, p.id)}
                        >
                          Accept
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ))
          )}
          {submitting ? (
            <p className="mr-6 text-sm italic text-[var(--text-4)]">Thinking…</p>
          ) : null}
        </div>

        {/* Composer */}
        <div className="border-t border-[var(--border-2)] p-4">
          {error ? (
            <p className="mb-2 text-sm font-medium text-[var(--danger-500)]">{error}</p>
          ) : null}

          {scans.length > 0 && messages.length === 0 ? (
            <label className="mb-2 block">
              <span className="text-xs font-medium text-[var(--text-3)]">
                Link a Pulse scan (optional)
              </span>
              <select
                value={pulseScanId}
                onChange={(e) => setPulseScanId(e.target.value)}
                className="app-select-compact mt-1"
              >
                <option value="">No linked scan</option>
                {scans.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.projectName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="flex items-end gap-2">
            <textarea
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
              placeholder="Ask the assistant…"
              rows={2}
              className="app-textarea flex-1"
              maxLength={8000}
            />
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleSubmit}
              disabled={composer.trim().length === 0 || submitting}
              loading={submitting}
              leadingIcon={<PaperAirplaneIcon className="h-4 w-4" />}
            >
              Send
            </Button>
          </div>
          <p className="mt-1 text-[11px] text-[var(--text-4)]">
            ⌘+Enter to send. Esc to close.
          </p>
        </div>
      </aside>
    </div>
  );
}
