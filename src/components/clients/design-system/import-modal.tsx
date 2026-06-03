"use client";

import { useState } from "react";
import { designTokensSchema } from "@/server/validators";
import { useSaveClientDesignSystem } from "@/hooks/use-design-system";
import type { DesignTokens } from "@/types/design-tokens";

const MONO = "var(--font-mono), 'SF Mono', Menlo, Consolas, monospace";

export function ImportModal({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const save = useSaveClientDesignSystem(slug);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  const submit = async () => {
    setErrors([]);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      setErrors([`Invalid JSON — ${e instanceof Error ? e.message : "could not parse"}`]);
      return;
    }
    const result = designTokensSchema.safeParse(parsed);
    if (!result.success) {
      setErrors(
        result.error.issues
          .slice(0, 12)
          .map((i) => `${i.path.join(".") || "(root)"} — ${i.message}`),
      );
      return;
    }
    try {
      await save.mutateAsync({ tokens: result.data as DesignTokens, status: "ACTIVE" });
      onClose();
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "Failed to save"]);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-[12px] bg-white shadow-[0_12px_32px_-4px_rgba(0,0,0,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">··</span>
            {" // IMPORT DESIGN TOKENS"}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-[4px] text-[var(--text-3)] hover:bg-[var(--surface-1)]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto p-5">
          <p className="text-[13px] text-[var(--text-3)]">
            Paste the <code style={{ fontFamily: MONO }}>design-tokens.json</code> produced by the
            Cowork <span className="font-medium text-[var(--text-2)]">design-system</span> skill, or
            upload the file. It’s validated against the schema before saving.
          </p>
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            className="text-[12px] text-[var(--text-3)]"
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            placeholder={'{\n  "clientName": "Acme",\n  "colours": { "primary": [], "secondary": [], "neutrals": [] },\n  ...\n}'}
            style={{
              fontFamily: MONO,
              fontSize: 12,
              minHeight: 260,
              width: "100%",
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.14)",
              padding: 12,
              color: "var(--text-1)",
              outline: "none",
              resize: "vertical",
            }}
          />
          {errors.length > 0 && (
            <div className="rounded-[8px] border border-[#FCA5A5] bg-[#FEE2E2] p-3 text-[12px] text-[#991B1B]">
              <p className="mb-1 font-semibold">
                Couldn’t import — {errors.length} issue{errors.length === 1 ? "" : "s"}:
              </p>
              <ul className="list-disc space-y-0.5 pl-4">
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[rgba(0,0,0,0.08)] p-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-1.5 text-[13px] font-medium text-[var(--text-2)] hover:bg-[var(--surface-1)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={save.isPending || !text.trim()}
            className="rounded-[6px] bg-[var(--brand-600)] px-4 py-1.5 text-[13px] font-medium text-white transition hover:bg-[var(--brand-700)] disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : "Validate & import"}
          </button>
        </div>
      </div>
    </div>
  );
}
