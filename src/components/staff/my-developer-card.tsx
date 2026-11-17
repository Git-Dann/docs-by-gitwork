"use client";

/**
 * Backstage → Me: a developer fills in what only they really know — their GitHub handle,
 * their stack, where they are, their links. The team's side of their card (rates, clients,
 * reviews) stays in Code. Rules are in src/lib/developer-self-details.ts.
 */

import { useEffect, useState } from "react";
import { WidgetCard } from "@/components/codeclear/codeclear-shared";
import { Field, HeaderAction } from "@/components/staff/profile-parts";
import { useToast } from "@/components/ui/toast";
import { useOwnDeveloperDetails, useUpdateOwnDeveloperDetails } from "@/hooks/use-staff";
import { cleanGithubHandle, missingDeveloperDetails, type OwnDeveloperDetails } from "@/lib/developer-self-details";

type Draft = {
  githubHandle: string;
  primaryStack: string;
  techStacks: string;
  location: string;
  timezone: string;
  linkedinUrl: string;
  portfolioUrl: string;
};

function toDraft(d: OwnDeveloperDetails): Draft {
  return {
    githubHandle: d.githubHandle ?? "",
    primaryStack: d.primaryStack ?? "",
    techStacks: d.techStacks.join(", "),
    location: d.location ?? "",
    timezone: d.timezone ?? "",
    linkedinUrl: d.linkedinUrl ?? "",
    portfolioUrl: d.portfolioUrl ?? "",
  };
}

const field = "block text-[12px] font-medium text-[var(--text-2)]";
/** 16px on a phone, so iOS doesn't zoom the page when a field takes focus. */
const input = "app-input mt-1 w-full text-base sm:text-[14px]";

export function MyDeveloperCard({ number }: { number: string }) {
  const query = useOwnDeveloperDetails();
  const save = useUpdateOwnDeveloperDetails();
  const toast = useToast();
  const d = query.data ?? null;
  const missing = d ? missingDeveloperDetails(d) : [];
  // Open straight into the form when something's missing: that's why they're here.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (d && draft === null) {
      setDraft(toDraft(d));
      if (missingDeveloperDetails(d).length) setEditing(true);
    }
  }, [d, draft]);

  if (!d || !d.isDeveloper || !draft) return null;

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [k]: e.target.value });

  async function submit() {
    if (!draft) return;
    setError(null);
    try {
      const saved = await save.mutateAsync({
        githubHandle: draft.githubHandle.trim() || null,
        primaryStack: draft.primaryStack,
        techStacks: draft.techStacks.split(","),
        location: draft.location,
        timezone: draft.timezone,
        linkedinUrl: draft.linkedinUrl,
        portfolioUrl: draft.portfolioUrl,
      });
      setDraft(toDraft(saved));
      setEditing(false);
      toast.success("Developer details saved", "The team sees them on your card in Code.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your details");
    }
  }

  return (
    <WidgetCard
      number={number}
      name="Your developer details"
      status={missing.length ? `Missing ${missing.join(" and ")}` : "Complete"}
      statusTone={missing.length ? "warning" : "success"}
      action={
        !editing ? (
          <HeaderAction onClick={() => setEditing(true)} label="Edit your developer details">
            Edit
          </HeaderAction>
        ) : undefined
      }
    >
      {editing ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {missing.length ? (
            <p className="text-[13px] text-[var(--text-3)]">
              Add your {missing.join(" and ")} so the team can see your work and put you on the right projects.
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className={field}>
              GitHub username
              <input
                className={`${input} font-mono`}
                value={draft.githubHandle}
                onChange={set("githubHandle")}
                onBlur={() => setDraft({ ...draft, githubHandle: draft.githubHandle ? cleanGithubHandle(draft.githubHandle) : "" })}
                placeholder="e.g. octocat"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label className={field}>
              Main stack
              <input className={input} value={draft.primaryStack} onChange={set("primaryStack")} placeholder="e.g. Flutter, React, iOS" maxLength={60} />
            </label>
            <label className={`${field} sm:col-span-2`}>
              Other technologies
              <input className={input} value={draft.techStacks} onChange={set("techStacks")} placeholder="Separate with commas: Node, Postgres, Firebase" />
            </label>
            <label className={field}>
              Location
              <input className={input} value={draft.location} onChange={set("location")} placeholder="e.g. Lahore, Pakistan" maxLength={80} />
            </label>
            <label className={field}>
              Time zone
              <input className={input} value={draft.timezone} onChange={set("timezone")} placeholder="e.g. Asia/Karachi" maxLength={60} />
            </label>
            <label className={field}>
              LinkedIn (optional)
              <input className={input} value={draft.linkedinUrl} onChange={set("linkedinUrl")} placeholder="linkedin.com/in/…" inputMode="url" />
            </label>
            <label className={field}>
              Portfolio (optional)
              <input className={input} value={draft.portfolioUrl} onChange={set("portfolioUrl")} placeholder="Your site or projects" inputMode="url" />
            </label>
          </div>
          {error ? (
            <p role="alert" className="text-[13px] text-[var(--danger-500)]">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            {!missing.length ? (
              <button
                type="button"
                className="app-button app-button-secondary app-button-sm"
                disabled={save.isPending}
                onClick={() => {
                  setDraft(toDraft(d));
                  setError(null);
                  setEditing(false);
                }}
              >
                Cancel
              </button>
            ) : null}
            <button type="submit" className="app-button app-button-primary app-button-sm" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      ) : (
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="GitHub">
            {d.githubHandle ? (
              <a href={`https://github.com/${d.githubHandle}`} target="_blank" rel="noreferrer noopener" className="font-mono hover:text-[var(--brand-600)] hover:underline">
                @{d.githubHandle}
              </a>
            ) : (
              "—"
            )}
          </Field>
          <Field label="Stack">{[d.primaryStack, ...d.techStacks.filter((t) => t !== d.primaryStack)].filter(Boolean).join(", ") || "—"}</Field>
          <Field label="Location">{[d.location, d.timezone].filter(Boolean).join(" · ") || "—"}</Field>
          <Field label="Links">
            {[d.linkedinUrl, d.portfolioUrl].filter(Boolean).length ? (
              <span className="flex flex-wrap gap-x-3">
                {d.linkedinUrl ? (
                  <a href={d.linkedinUrl} target="_blank" rel="noreferrer noopener" className="hover:text-[var(--brand-600)] hover:underline">
                    LinkedIn
                  </a>
                ) : null}
                {d.portfolioUrl ? (
                  <a href={d.portfolioUrl} target="_blank" rel="noreferrer noopener" className="hover:text-[var(--brand-600)] hover:underline">
                    Portfolio
                  </a>
                ) : null}
              </span>
            ) : (
              "—"
            )}
          </Field>
        </dl>
      )}
    </WidgetCard>
  );
}
