"use client";

/**
 * The parts of a developer's page that the Hiring review (`codeclear-candidate-profile.tsx`)
 * and the Staff profile's Developer card share: the hero readouts, the edit-dev dialog and the
 * notes. One copy each, so the two pages can't drift (docs/hr-platform.md, "One page per
 * developer").
 */

import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { CandidateProfileForm, type CandidateProfileValue } from "@/components/codeclear/candidate-profile-form";
import { useAddCodeClearCandidateNote, useUpdateCodeClearCandidate } from "@/hooks/use-codeclear";
import { cn, formatDate } from "@/lib/format";
import type { CandidateAvailability, CodeClearCandidateDetail } from "@/types/codeclear";

export function HeroStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border-r border-[var(--border-2)] px-6 py-4 last:border-r-0">
      <p className="widget-data-label">{label}</p>
      <p className="mt-1 flex items-baseline gap-1.5 font-display text-[28px] font-normal leading-[1.1] tracking-[-0.02em] text-[var(--text-1)]">
        {value}
        {sub ? <span className="widget-data-label text-[var(--text-4)]">{sub}</span> : null}
      </p>
    </div>
  );
}

export function AvailabilityBadge({ availability }: { availability: CandidateAvailability | null }) {
  if (!availability) return null;
  const label = availability === "AVAILABLE" ? "Available" : availability === "ENGAGED" ? "Engaged" : "Unavailable";
  const tone =
    availability === "AVAILABLE"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : availability === "ENGAGED"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-[var(--border-2)] bg-[var(--surface-1)] text-[var(--text-3)]";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[4px] border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]",
        tone,
      )}
    >
      {label}
    </span>
  );
}

export function ExternalLinks({
  linkedinUrl,
  cvUrl,
  portfolioUrl,
}: {
  linkedinUrl: string | null;
  cvUrl: string | null;
  portfolioUrl: string | null;
}) {
  const links = [
    linkedinUrl ? { href: linkedinUrl, label: "LinkedIn" } : null,
    cvUrl ? { href: cvUrl, label: "CV" } : null,
    portfolioUrl ? { href: portfolioUrl, label: "Portfolio" } : null,
  ].filter((entry): entry is { href: string; label: string } => entry !== null);
  if (links.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] bg-white px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-3)] transition hover:border-[var(--brand-400)] hover:text-[var(--brand-700)]"
        >
          {link.label}
          <ArrowTopRightOnSquareIcon className="h-3 w-3" />
        </a>
      ))}
    </div>
  );
}

/**
 * The edit form's starting values. The monthly rate falls back to the linked rate-card figure,
 * so a dev paid on a monthly retainer sees their actual rate on first open.
 */
export function candidateToForm(candidate: CodeClearCandidateDetail): CandidateProfileValue {
  return {
    name: candidate.name,
    githubHandle: candidate.githubHandle,
    email: candidate.email ?? "",
    primaryStack: candidate.primaryStack,
    techStacks: candidate.techStacks.length ? candidate.techStacks : [candidate.primaryStack],
    location: candidate.location ?? "",
    bio: candidate.bio ?? "",
    wikiBio: candidate.wikiBio ?? "",
    linkedinUrl: candidate.linkedinUrl ?? "",
    cvUrl: candidate.cvUrl ?? "",
    portfolioUrl: candidate.portfolioUrl ?? "",
    yearsExperience: candidate.yearsExperience != null ? String(candidate.yearsExperience) : "",
    hourlyRate:
      candidate.hourlyRate != null ? String(candidate.hourlyRate) : candidate.monthlyRate != null ? String(candidate.monthlyRate) : "",
    currency: candidate.currency ?? candidate.monthlyRateCurrency ?? "USD",
    timezone: candidate.timezone ?? "",
    availability: candidate.availability ?? "",
    origin: candidate.origin,
    // Clients are managed by the current-client picker, not this form.
    clientIds: [],
  };
}

/** What Save sends. Blanks become null; the stack list is never empty. */
export function formToCandidatePatch(form: CandidateProfileValue) {
  return {
    name: form.name,
    githubHandle: form.githubHandle,
    email: form.email || null,
    primaryStack: form.primaryStack,
    techStacks: form.techStacks.length ? form.techStacks : [form.primaryStack],
    location: form.location || null,
    bio: form.bio || null,
    wikiBio: form.wikiBio || null,
    linkedinUrl: form.linkedinUrl || null,
    cvUrl: form.cvUrl || null,
    portfolioUrl: form.portfolioUrl || null,
    yearsExperience: form.yearsExperience !== "" ? Number(form.yearsExperience) : null,
    hourlyRate: form.hourlyRate !== "" ? Number(form.hourlyRate) : null,
    currency: form.currency || null,
    timezone: form.timezone || null,
    availability: form.availability || null,
  };
}

/** The edit-dev dialog. Mounted only while open, so it always starts from the saved values. */
export function EditDevModal({ candidate, onClose }: { candidate: CodeClearCandidateDetail; onClose: () => void }) {
  const update = useUpdateCodeClearCandidate(candidate.id);
  const [form, setForm] = useState<CandidateProfileValue>(() => candidateToForm(candidate));
  return (
    <Modal open onClose={onClose} title="01 // EDIT DEV" panelClassName="app-dialog-fixed w-full max-w-2xl">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <p className="mb-4 text-sm text-[var(--text-4)]">Editing {candidate.name}. Changes apply immediately on Save.</p>
        <CandidateProfileForm value={form} onChange={setForm} />
        {update.error ? (
          <p role="alert" className="mt-3 text-[13px] text-[var(--danger-500)]">
            {update.error instanceof Error ? update.error.message : "Could not save"}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--border-2)] px-6 py-4">
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={async () => {
            await update.mutateAsync(formToCandidatePatch(form));
            onClose();
          }}
          loading={update.isPending}
          disabled={!form.name.trim() || !form.githubHandle.trim() || !form.primaryStack.trim()}
        >
          Save
        </Button>
      </div>
    </Modal>
  );
}

/** Notes about a developer: add one, read them newest first. */
export function CandidateNotes({ candidate }: { candidate: CodeClearCandidateDetail }) {
  const addNote = useAddCodeClearCandidateNote(candidate.id);
  const [body, setBody] = useState("");
  const add = async () => {
    if (!body.trim()) return;
    await addNote.mutateAsync({ body: body.trim() });
    setBody("");
  };
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Add a note about this dev…"
          aria-label="New note"
          className="app-input min-h-[64px] flex-1 resize-y text-sm"
          rows={2}
        />
        <Button type="button" variant="primary" size="sm" onClick={add} disabled={!body.trim() || addNote.isPending}>
          Add
        </Button>
      </div>
      {candidate.notes.length ? (
        <ul className="space-y-2">
          {candidate.notes.map((note) => (
            <li key={note.id} className="rounded-[10px] border border-[var(--border-2)] bg-white px-4 py-3">
              <p className="text-sm leading-6 text-[var(--text-2)]">{note.body}</p>
              <p className="mt-2 font-mono text-[11px] text-[var(--text-4)]">
                {note.createdBy} · {formatDate(note.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-2 text-center text-sm text-[var(--text-4)]">No notes yet.</p>
      )}
    </div>
  );
}
