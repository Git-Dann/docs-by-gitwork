"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { WidgetCard } from "@/components/codeclear/codeclear-shared";
import { usePermissions } from "@/hooks/use-permissions";
import { useNotice } from "./notice";
import { useDevSignalNotice, useUpdateDevSignalNotice } from "@/hooks/use-devsignal";
import type { NoticeContent } from "@/lib/devsignal/processing-notice";

/**
 * Editor for the candidate consent + right-to-explanation notice (GDPR). Saving
 * publishes a NEW version; past consent records keep the version they agreed to.
 * The two consent-item KEYS are fixed (the server gate needs both) — only their
 * wording is editable. Super Admin only.
 */
export function NoticeEditor() {
  const { canCalibrateDevSignal } = usePermissions();
  const query = useDevSignalNotice(canCalibrateDevSignal);
  const save = useUpdateDevSignalNotice();
  const { showOk, showErr, noticeEl } = useNotice();

  const [content, setContent] = useState<NoticeContent | null>(null);
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    if (query.data) {
      setContent(query.data.notice.content);
      setVersion(query.data.notice.version);
    }
  }, [query.data]);

  if (!canCalibrateDevSignal) {
    return (
      <p className="text-sm text-[var(--text-3)]">
        The consent notice is editable by Super Admins only (it&apos;s a legal/compliance surface).
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--brand-700)]">
          DevSignal · Super Admin
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-[var(--text-1)]">Consent notice</h2>
        <p className="mt-1 max-w-2xl text-sm text-[var(--text-3)]">
          The consent + &ldquo;how you&apos;re assessed&rdquo; copy every candidate sees before any of
          their data is processed. Saving publishes a new version{version ? ` (current: ${version})` : ""};
          past consents keep the version they agreed to. Have your data-protection advisor review the
          wording.
        </p>
      </div>

      {query.isLoading || !content ? (
        <p className="text-sm text-[var(--text-4)]">Loading…</p>
      ) : (
        <>
          <WidgetCard number="01" name="Contact">
            <label className="block">
              <span className="widget-data-label mb-1 block">Data-rights contact email</span>
              <input
                type="email"
                value={content.contactEmail}
                onChange={(e) => setContent({ ...content, contactEmail: e.target.value })}
                className="app-input w-full max-w-md"
              />
            </label>
          </WidgetCard>

          <WidgetCard number="02" name="Consent checkboxes">
            <p className="text-xs text-[var(--text-4)]">
              Both are required and their roles are fixed — edit the wording only.
            </p>
            <div className="mt-3 space-y-3">
              {content.consentItems.map((item, i) => (
                <div key={item.key}>
                  <span className="widget-data-label mb-1 block">{item.key}</span>
                  <textarea
                    value={item.label}
                    rows={3}
                    onChange={(e) => {
                      const next = [...content.consentItems];
                      next[i] = { ...item, label: e.target.value };
                      setContent({ ...content, consentItems: next });
                    }}
                    className="app-input w-full"
                  />
                </div>
              ))}
            </div>
          </WidgetCard>

          <WidgetCard number="03" name="How you're assessed">
            <p className="text-xs text-[var(--text-4)]">The per-stage explanation (Art. 22 transparency).</p>
            <div className="mt-3 space-y-3">
              {content.explanationStages.map((s, i) => (
                <div key={i} className="rounded-[8px] border border-[var(--border-2)] p-3">
                  <div className="flex items-center gap-2">
                    <input
                      value={s.title}
                      placeholder="Stage title"
                      onChange={(e) => {
                        const next = [...content.explanationStages];
                        next[i] = { ...s, title: e.target.value };
                        setContent({ ...content, explanationStages: next });
                      }}
                      className="app-input flex-1 font-medium"
                    />
                    <label className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--text-3)]">
                      <input
                        type="checkbox"
                        checked={s.automated}
                        onChange={(e) => {
                          const next = [...content.explanationStages];
                          next[i] = { ...s, automated: e.target.checked };
                          setContent({ ...content, explanationStages: next });
                        }}
                        className="accent-[var(--brand-600)]"
                      />
                      automated
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setContent({ ...content, explanationStages: content.explanationStages.filter((_, j) => j !== i) })
                      }
                      className="shrink-0 text-xs text-rose-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                  <textarea
                    value={s.measures}
                    rows={2}
                    placeholder="What this stage measures…"
                    onChange={(e) => {
                      const next = [...content.explanationStages];
                      next[i] = { ...s, measures: e.target.value };
                      setContent({ ...content, explanationStages: next });
                    }}
                    className="app-input mt-2 w-full text-sm"
                  />
                </div>
              ))}
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() =>
                setContent({
                  ...content,
                  explanationStages: [...content.explanationStages, { title: "", measures: "", automated: true }],
                })
              }
            >
              + Add stage
            </Button>
          </WidgetCard>

          <WidgetCard number="04" name="Data handling points">
            <div className="space-y-2">
              {content.dataHandlingPoints.map((p, i) => (
                <div key={i} className="flex items-start gap-2">
                  <textarea
                    value={p}
                    rows={2}
                    onChange={(e) => {
                      const next = [...content.dataHandlingPoints];
                      next[i] = e.target.value;
                      setContent({ ...content, dataHandlingPoints: next });
                    }}
                    className="app-input w-full text-sm"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setContent({ ...content, dataHandlingPoints: content.dataHandlingPoints.filter((_, j) => j !== i) })
                    }
                    className="shrink-0 pt-2 text-xs text-rose-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => setContent({ ...content, dataHandlingPoints: [...content.dataHandlingPoints, ""] })}
            >
              + Add point
            </Button>
          </WidgetCard>

          <div className="flex items-center justify-end gap-3">
            <span className="text-xs text-[var(--text-4)]">Publishing creates a new notice version.</span>
            <Button
              variant="primary"
              disabled={save.isPending}
              onClick={async () => {
                try {
                  const res = await save.mutateAsync(content);
                  setVersion(res.notice.version);
                  showOk("Notice published", `Now live as ${res.notice.version}.`);
                } catch (e) {
                  showErr("Could not save", e instanceof Error ? e.message : undefined);
                }
              }}
            >
              {save.isPending ? "Publishing…" : "Publish notice"}
            </Button>
          </div>
        </>
      )}
      {noticeEl}
    </div>
  );
}
