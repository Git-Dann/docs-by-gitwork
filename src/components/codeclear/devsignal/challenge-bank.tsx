"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Section } from "./devsignal-ui";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/format";
import { useNotice } from "./notice";
import {
  useCreateDevSignalChallenge,
  useDevSignalChallenges,
  useUpdateDevSignalChallenge,
} from "@/hooks/use-devsignal";
import type { DevSignalChallengeInput } from "@/lib/api";
import type { DevSignalChallengeDTO } from "@/types/devsignal";

type Difficulty = DevSignalChallengeDTO["difficulty"];

const DIFFICULTY_TONE: Record<Difficulty, string> = {
  junior: "border-sky-200 bg-sky-50 text-sky-700",
  mid: "border-emerald-200 bg-emerald-50 text-emerald-700",
  senior: "border-amber-200 bg-amber-50 text-amber-700",
  staff: "border-violet-200 bg-violet-50 text-violet-700",
};

export function ChallengeBank() {
  const { canManageDevSignal } = usePermissions();
  const challenges = useDevSignalChallenges();
  const [editing, setEditing] = useState<DevSignalChallengeDTO | "new" | null>(null);

  if (!canManageDevSignal) {
    return <p className="text-sm text-[var(--text-3)]">You don&apos;t have access to DevSignal.</p>;
  }

  const items = challenges.data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--brand-700)]">
            DevSignal
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-[var(--text-1)]">
            Challenge bank
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--text-3)]">
            The coding tasks candidates are served. Each is tagged by role, stack, seniority and the
            competencies it measures — an assessment serves the best match for what a candidate
            declares. Grow the bank here; changes apply to new assessments immediately.
          </p>
        </div>
        <Button variant="primary" onClick={() => setEditing("new")}>
          New challenge
        </Button>
      </div>

      {challenges.isLoading ? (
        <p className="text-sm text-[var(--text-4)]">Loading…</p>
      ) : items.length === 0 ? (
        <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-4 py-8 text-center text-sm text-[var(--text-4)]">
          No challenges yet.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((c) => (
            <ChallengeCard key={c.id} c={c} onEdit={() => setEditing(c)} />
          ))}
        </div>
      )}

      {editing && (
        <ChallengeEditor
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ChallengeCard({
  c,
  onEdit,
}: {
  c: DevSignalChallengeDTO;
  onEdit: () => void;
}) {
  const hidden = c.tests.filter((t) => t.hidden).length;
  return (
    <Section>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold leading-snug text-[var(--text-1)]">{c.title}</h3>
        <span
          className={cn(
            "shrink-0 rounded-[4px] border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]",
            DIFFICULTY_TONE[c.difficulty],
          )}
        >
          {c.difficulty}
        </span>
      </div>
      <p className="mt-1 font-mono text-[11px] text-[var(--text-4)]">
        {c.language} · {c.functionName}() · {c.tests.length} tests
        {hidden ? ` (${hidden} hidden)` : ""} · {Math.round(c.timeLimitSec / 60)}m
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {[...c.roles, ...c.stacks, ...c.competencies].slice(0, 8).map((t, i) => (
          <span
            key={`${t}-${i}`}
            className="rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-1)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-3)]"
          >
            {t}
          </span>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <Button variant="secondary" size="sm" onClick={onEdit}>
          Edit
        </Button>
      </div>
    </Section>
  );
}

// ─── Editor ──────────────────────────────────────────────────────────────────

const DIFFICULTIES: Difficulty[] = ["junior", "mid", "senior", "staff"];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function ChallengeEditor({
  initial,
  onClose,
}: {
  initial: DevSignalChallengeDTO | null;
  onClose: () => void;
}) {
  const { showOk, showErr, noticeEl } = useNotice();
  const create = useCreateDevSignalChallenge();
  const update = useUpdateDevSignalChallenge();
  const isEdit = Boolean(initial);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.id ?? "");
  const [language, setLanguage] = useState<"javascript" | "typescript">(initial?.language ?? "javascript");
  const [difficulty, setDifficulty] = useState<Difficulty>(initial?.difficulty ?? "mid");
  const [roles, setRoles] = useState((initial?.roles ?? []).join(", "));
  const [stacks, setStacks] = useState((initial?.stacks ?? []).join(", "));
  const [competencies, setCompetencies] = useState((initial?.competencies ?? []).join(", "));
  const [functionName, setFunctionName] = useState(initial?.functionName ?? "");
  const [timeLimitMin, setTimeLimitMin] = useState(String(Math.round((initial?.timeLimitSec ?? 1800) / 60)));
  const [promptMarkdown, setPromptMarkdown] = useState(initial?.promptMarkdown ?? "");
  const [starterCode, setStarterCode] = useState(
    initial?.starterCode ?? "function fn(input) {\n  // your code here\n}\n",
  );
  const [testsJson, setTestsJson] = useState(
    JSON.stringify(initial?.tests ?? [{ name: "example", args: [], expected: null }], null, 2),
  );

  const parsedTests = useMemo(() => {
    try {
      const value = JSON.parse(testsJson);
      if (!Array.isArray(value) || value.length === 0) return { error: "Tests must be a non-empty array." };
      for (const t of value) {
        if (typeof t?.name !== "string" || !Array.isArray(t?.args) || !("expected" in t)) {
          return { error: "Each test needs { name, args, expected }." };
        }
      }
      return { value };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Invalid JSON." };
    }
  }, [testsJson]);

  const toList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
  const pending = create.isPending || update.isPending;

  const canSave =
    title.trim() &&
    functionName.trim() &&
    promptMarkdown.trim() &&
    starterCode.trim() &&
    !parsedTests.error &&
    (isEdit || slug.trim());

  const submit = async () => {
    if (parsedTests.error) {
      showErr("Fix the tests", parsedTests.error);
      return;
    }
    const timeLimitSec = Math.max(60, Math.round((Number(timeLimitMin) || 30) * 60));
    const shared = {
      title: title.trim(),
      language,
      difficulty,
      roles: toList(roles),
      stacks: toList(stacks),
      competencies: toList(competencies),
      promptMarkdown,
      functionName: functionName.trim(),
      starterCode,
      timeLimitSec,
      tests: parsedTests.value as DevSignalChallengeInput["tests"],
      isActive: true,
    };
    try {
      if (isEdit && initial) {
        await update.mutateAsync({ slug: initial.id, input: shared });
        showOk("Challenge updated");
      } else {
        const finalSlug = slug.trim() || slugify(title);
        await create.mutateAsync({ ...shared, slug: finalSlug });
        showOk("Challenge created");
      }
      onClose();
    } catch (e) {
      showErr("Could not save", e instanceof Error ? e.message : undefined);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? `Edit — ${initial?.title}` : "New challenge"}
      panelClassName="w-[760px] max-w-[94vw]"
    >
      <div className="flex max-h-[76vh] flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-4">
            <TextField label="Title" value={title} onChange={setTitle} />
            <TextField
              label="Slug"
              value={isEdit ? initial!.id : slug}
              onChange={setSlug}
              disabled={isEdit}
              placeholder="auto from title"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <SelectField
              label="Language"
              value={language}
              onChange={(v) => setLanguage(v as "javascript" | "typescript")}
              options={["javascript", "typescript"]}
            />
            <SelectField
              label="Difficulty"
              value={difficulty}
              onChange={(v) => setDifficulty(v as Difficulty)}
              options={DIFFICULTIES}
            />
            <TextField label="Time limit (min)" value={timeLimitMin} onChange={setTimeLimitMin} type="number" />
          </div>

          <TextField label="Function name" value={functionName} onChange={setFunctionName} placeholder="invoiceTotal" />

          <div className="grid grid-cols-3 gap-4">
            <TextField label="Roles" value={roles} onChange={setRoles} placeholder="backend, data" />
            <TextField label="Stacks" value={stacks} onChange={setStacks} placeholder="javascript, node" />
            <TextField
              label="Competencies"
              value={competencies}
              onChange={setCompetencies}
              placeholder="correctness, api-design"
            />
          </div>
          <p className="-mt-2 text-xs text-[var(--text-4)]">
            Comma-separated tags. These drive matching — a candidate is served the challenge whose
            stack/role/seniority best fits what they declared.
          </p>

          <AreaField
            label="Prompt (markdown)"
            value={promptMarkdown}
            onChange={setPromptMarkdown}
            rows={6}
          />
          <AreaField label="Starter code" value={starterCode} onChange={setStarterCode} rows={5} mono />

          <div>
            <AreaField
              label="Tests (JSON array of { name, args, expected, hidden? })"
              value={testsJson}
              onChange={setTestsJson}
              rows={8}
              mono
            />
            {parsedTests.error ? (
              <p className="mt-1 font-mono text-xs text-rose-600">{parsedTests.error}</p>
            ) : (
              <p className="mt-1 font-mono text-xs text-emerald-600">
                {(parsedTests.value as unknown[]).length} tests parse OK
              </p>
            )}
            <p className="mt-1 text-xs text-[var(--text-4)]">
              Tests run in the candidate&apos;s browser against <code>{functionName || "fn"}(...args)</code>.
              Execution is JS-only — non-JS stacks need a runner (not yet wired).
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--border-1)] px-6 py-4">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={pending || !canSave}>
            {pending ? "Saving…" : isEdit ? "Save changes" : "Create challenge"}
          </Button>
        </div>
      </div>
      {noticeEl}
    </Modal>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-4)]">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="app-input w-full disabled:opacity-60"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-4)]">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="app-select w-full">
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function AreaField({
  label,
  value,
  onChange,
  rows,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-4)]">{label}</span>
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className={cn("app-input w-full resize-y", mono && "font-mono text-xs leading-relaxed")}
      />
    </label>
  );
}
