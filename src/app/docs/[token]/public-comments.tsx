/**
 * Public-side comment composer for /docs/[token].
 *
 * Anonymous visitor types a name + email + comment body. POST to the public API endpoint;
 * the workspace sees it in their CollabPanel.
 *
 * Renders below the document body as a self-contained card.
 */

"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface PublicComment {
  id: string;
  sectionId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
}

export function PublicComments({ token }: { token: string }) {
  const [comments, setComments] = useState<PublicComment[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thanks, setThanks] = useState(false);

  useEffect(() => {
    void fetch(`/api/docs/${token}/comments`)
      .then((res) => res.json())
      .then((data) => setComments(data?.data?.comments ?? data?.comments ?? []))
      .catch(() => {
        // Comments are best-effort on the public page; silently fall back to empty.
      });
  }, [token]);

  async function handleSubmit() {
    if (body.trim().length < 2 || name.trim().length === 0 || !email.includes("@")) {
      setError("Add your name, email, and a short comment.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/docs/${token}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorName: name.trim(),
          authorEmail: email.trim(),
          body: body.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to post comment");
      setBody("");
      setThanks(true);
      setTimeout(() => setThanks(false), 4000);
      // Reload the comment list
      const fresh = await fetch(`/api/docs/${token}/comments`).then((r) => r.json());
      setComments(fresh?.data?.comments ?? fresh?.comments ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="border-t border-[var(--border-2)] bg-[var(--surface-canvas)]">
      <div className="mx-auto w-full max-w-[880px] px-4 py-12 sm:px-6">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[1.2px] text-[var(--brand-700)]">
          QUESTIONS OR FEEDBACK?
        </p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-[28px] font-normal leading-[1.15] tracking-[-0.5px] text-[var(--text-1)]">
          Drop a comment.
        </h2>
        <p className="mt-2 text-sm text-[var(--text-3)]">
          The team will see your note in their workspace and can reply via email or update the
          document directly.
        </p>

        {comments.length > 0 ? (
          <ul className="mt-6 space-y-3">
            {comments.map((c) => (
              <li
                key={c.id}
                className="rounded-[10px] border border-[var(--border-2)] bg-white px-4 py-3 text-sm"
              >
                <p className="font-medium text-[var(--text-1)]">{c.authorName}</p>
                <p className="mt-1 whitespace-pre-wrap text-[var(--text-2)]">{c.body}</p>
                <p className="mt-2 text-[11px] text-[var(--text-4)]">
                  {new Date(c.createdAt).toLocaleDateString()}
                </p>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-6 space-y-3 rounded-[10px] border border-[var(--border-2)] bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="app-input"
              maxLength={120}
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              type="email"
              className="app-input"
              maxLength={200}
            />
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What would you like to flag?"
            rows={3}
            className="app-textarea"
            maxLength={4000}
          />
          {error ? <p className="text-sm font-medium text-[var(--danger-500)]">{error}</p> : null}
          {thanks ? (
            <p className="text-sm font-medium text-[var(--success-500)]">
              Thanks — the team has been notified.
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleSubmit}
              loading={submitting}
            >
              Post comment
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
