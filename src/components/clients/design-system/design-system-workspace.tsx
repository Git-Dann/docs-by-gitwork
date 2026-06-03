"use client";

import Link from "next/link";
import { useState } from "react";
import { useClientDetail } from "@/hooks/use-proposals";
import {
  useClientDesignSystem,
  useSetClientDesignSystemShare,
} from "@/hooks/use-design-system";
import { Button } from "@/components/ui/button";
import { DesignSystemViewer } from "./design-system-viewer";
import { ImportModal } from "./import-modal";
import { LogoManagerModal } from "./logo-manager-modal";

const MONO = "var(--font-mono), 'SF Mono', Menlo, Consolas, monospace";

export function DesignSystemWorkspace({ slug }: { slug: string }) {
  const { data: clientData } = useClientDetail(slug);
  const client = clientData?.client;
  const { data: ds, isPending } = useClientDesignSystem(slug);
  const share = useSetClientDesignSystemShare(slug);

  const [importOpen, setImportOpen] = useState(false);
  const [logoOpen, setLogoOpen] = useState(false);
  const [copiedCss, setCopiedCss] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const tokens = ds?.tokens ?? null;
  const shareOn = ds?.share.enabled ?? false;
  const shareUrl =
    ds?.share.url && typeof window !== "undefined"
      ? `${window.location.origin}${ds.share.url}`
      : ds?.share.url ?? null;

  const copy = async (value: string, set: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(value);
      set(true);
      window.setTimeout(() => set(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/app/portal/${slug}`}
          className="text-[13px] text-[var(--text-3)] transition hover:text-[var(--brand-700)]"
        >
          ← {client?.name ?? "Client"}
        </Link>
        {ds?.exists && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => tokens && copy(tokens.cssVariables || "", setCopiedCss)}
            >
              {copiedCss ? "Copied ✓" : "Copy CSS"}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
              Update
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setLogoOpen(true)}>
              Logos
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={share.isPending}
              onClick={() => share.mutate(!shareOn)}
            >
              {shareOn ? "Shared" : "Share"}
            </Button>
          </div>
        )}
      </div>

      {ds?.exists && shareOn && shareUrl && (
        <div className="mb-5 flex flex-wrap items-center gap-3 text-[12px]">
          <code className="truncate text-[var(--text-3)]" style={{ fontFamily: MONO }}>
            {shareUrl}
          </code>
          <button
            type="button"
            onClick={() => copy(shareUrl, setCopiedLink)}
            className="shrink-0 font-medium text-[var(--brand-700)] hover:underline"
          >
            {copiedLink ? "Copied ✓" : "Copy link"}
          </button>
          <a
            href={ds.share.url ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 font-medium text-[var(--brand-700)] hover:underline"
          >
            Open ↗
          </a>
        </div>
      )}

      {isPending ? (
        <p className="py-20 text-center text-sm text-[var(--text-4)]">Loading…</p>
      ) : !ds?.exists || !tokens ? (
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">01</span>
              {" // DESIGN SYSTEM"}
            </span>
          </div>
          <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
            <p className="max-w-md text-[14px] leading-relaxed text-[var(--text-3)]">
              No design system yet. Generate this client’s tokens with the Cowork{" "}
              <span className="font-medium text-[var(--text-2)]">design-system</span> skill, then
              import the JSON here.
            </p>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="rounded-[6px] bg-[var(--brand-600)] px-4 py-2 text-[13px] font-medium text-white transition hover:bg-[var(--brand-700)]"
            >
              Import JSON
            </button>
          </div>
        </section>
      ) : (
        <DesignSystemViewer tokens={tokens} clientLogoUrl={client?.logoUrl ?? null} />
      )}

      {importOpen && <ImportModal slug={slug} onClose={() => setImportOpen(false)} />}
      {logoOpen && ds?.tokens && (
        <LogoManagerModal
          slug={slug}
          tokens={ds.tokens}
          status={ds.status}
          onClose={() => setLogoOpen(false)}
        />
      )}
    </div>
  );
}
