"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  PencilSquareIcon,
  DocumentDuplicateIcon,
  TrashIcon,
  ArrowLeftIcon,
  CheckIcon,
  ArrowRightIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import {
  useStarter,
  useDeleteStarter,
  useDuplicateStarter,
  useAdoptStarter,
} from "@/hooks/use-starters";
import { usePulseScan } from "@/hooks/use-pulse";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/format";
import { Markdown } from "@/lib/markdown";
import { Button, buttonStyles } from "@/components/ui/button";
import { StarterForm } from "@/components/starters/starter-form";
import type { StarterType } from "@/server/starters";

const TYPE_LABEL: Record<StarterType, string> = {
  PROMPT: "Prompt",
  SKILL: "Skill",
  PLUGIN: "Plugin",
  KIT: "Kit",
  COLLECTION: "Collection",
};

const TYPE_TONE: Record<StarterType, string> = {
  PROMPT: "bg-[var(--mist)] text-[var(--brand-700)] border border-[var(--mist-border)]",
  SKILL: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  PLUGIN: "bg-violet-50 text-violet-700 border border-violet-200",
  KIT: "bg-amber-50 text-amber-700 border border-amber-200",
  COLLECTION: "bg-[var(--surface-1)] text-[var(--text-3)] border border-[var(--border-2)]",
};

export function StarterDetail({ starterId }: { starterId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scanId = searchParams.get("scanId");
  const { canManageStarters } = usePermissions();
  const { data: starter, isLoading } = useStarter(starterId);
  const { data: scanData } = usePulseScan(scanId ?? "");
  const scan = scanId ? scanData?.scan ?? null : null;
  const { mutate: deleteStarter } = useDeleteStarter();
  const { mutateAsync: duplicate, isPending: duplicating } = useDuplicateStarter();
  const { mutateAsync: adopt, isPending: adopting } = useAdoptStarter();
  const [editing, setEditing] = useState(false);

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)]" />;
  }
  if (!starter) {
    return (
      <div className="widget-card px-6 py-16 text-center">
        <p className="text-sm text-[var(--text-3)]">Starter not found.</p>
        <Link href="/app/starters" className={cn("mt-4 inline-flex", buttonStyles({ variant: "secondary", size: "sm" }))}>
          Back to library
        </Link>
      </div>
    );
  }

  if (editing) {
    return <StarterForm starter={starter} onSaved={() => setEditing(false)} />;
  }

  async function handleDuplicate() {
    const copy = await duplicate(starter!.id);
    router.push(`/app/starters/${copy.id}`);
  }

  async function handleAdopt() {
    if (!scanId) return;
    await adopt({ scanId, starterId: starter!.id });
    router.push(`/app/pulse/${scanId}`);
  }

  const whatYouGet = starter.content?.whatYouGet ?? [];
  const install = starter.content?.install ?? [];
  const techStack = starter.content?.techStack ?? [];
  const sourceUrl = starter.content?.sourceUrl;
  const sourceLabel = starter.content?.sourceLabel;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={scanId ? `/app/starters?scanId=${scanId}` : "/app/starters"}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-3)] transition hover:text-[var(--text-1)]"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          {scanId ? "Back to recommendations" : "Back to library"}
        </Link>
        {canManageStarters && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleDuplicate}
              loading={duplicating}
              leadingIcon={!duplicating ? <DocumentDuplicateIcon className="h-4 w-4" /> : null}
            >
              Duplicate
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setEditing(true)}
              leadingIcon={<PencilSquareIcon className="h-4 w-4" />}
            >
              Edit
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                if (confirm("Delete this starter?")) {
                  deleteStarter(starter.id);
                  router.push("/app/starters");
                }
              }}
              leadingIcon={<TrashIcon className="h-4 w-4" />}
            >
              Delete
            </Button>
          </div>
        )}
      </div>

      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">01</span>
            {" // STARTER"}
          </span>
          <span
            className={cn(
              "inline-flex items-center rounded-[4px] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]",
              TYPE_TONE[starter.type] ?? TYPE_TONE.KIT,
            )}
          >
            {TYPE_LABEL[starter.type]}
          </span>
        </div>
        <div className="px-6 py-6">
          <h1
            className="text-3xl leading-tight tracking-[-0.02em] text-[var(--text-1)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {starter.name}
          </h1>
          <p className="mt-2 text-sm text-[var(--text-3)]">{starter.summary}</p>

          {sourceUrl && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonStyles({ variant: "primary", size: "sm" }), "inline-flex items-center gap-1.5")}
              >
                View &amp; use
                <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
              </a>
              {sourceLabel && (
                <span className="font-mono text-[11px] text-[var(--text-4)]">
                  based on <span className="text-[var(--text-3)]">{sourceLabel}</span>
                </span>
              )}
            </div>
          )}

          {starter.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {starter.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-3)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {scan && (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[var(--mist-border)] bg-[var(--mist)] px-4 py-3">
              <p className="text-xs text-[var(--text-2)]">
                Link this starter to the scan of{" "}
                <span className="font-semibold text-[var(--text-1)]">{scan.projectName || "this project"}</span>?
              </p>
              <button
                type="button"
                onClick={handleAdopt}
                disabled={adopting}
                className="inline-flex items-center gap-1.5 rounded-[6px] bg-[var(--brand-700)] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                <CheckIcon className="h-4 w-4" />
                Use this starter
                <ArrowRightIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </section>

      {starter.description && (
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">02</span>
              {" // ABOUT"}
            </span>
          </div>
          <div className="px-6 py-5 text-sm leading-6 text-[var(--text-2)]">
            <Markdown>{starter.description}</Markdown>
          </div>
        </section>
      )}

      {whatYouGet.length > 0 && (
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">03</span>
              {" // WHAT YOU GET"}
            </span>
          </div>
          <ul className="space-y-2 px-6 py-5">
            {whatYouGet.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-2)]">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-700)]" />
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}

      {install.length > 0 && (
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">04</span>
              {" // INSTALL"}
            </span>
          </div>
          <ol className="space-y-2 px-6 py-5">
            {install.map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-[var(--text-2)]">
                <span className="mt-0.5 font-mono text-[11px] font-semibold text-[var(--brand-700)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </section>
      )}

      {techStack.length > 0 && (
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">05</span>
              {" // STACK"}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 px-6 py-5">
            {techStack.map((t) => (
              <span
                key={t}
                className="inline-flex items-center rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-0.5 font-mono text-[11px] text-[var(--text-2)]"
              >
                {t}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
