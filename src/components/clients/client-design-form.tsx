"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PreviewImagePicker } from "@/components/ui/preview-image-picker";
import type { ClientDesignRecord } from "@/types/client";

type DesignInput = {
  name: string;
  url: string;
  notes: string;
  previewImageUrl: string;
};

export function ClientDesignFormModal({
  design,
  onSave,
  onClose,
  isSaving,
  error,
}: {
  design?: ClientDesignRecord | null;
  onSave: (input: Partial<DesignInput> & { name: string }) => void;
  onClose: () => void;
  isSaving: boolean;
  error?: string | null;
}) {
  const [form, setForm] = useState<DesignInput>({
    name: design?.name ?? "",
    url: design?.url ?? "",
    notes: design?.notes ?? "",
    previewImageUrl: design?.previewImageUrl ?? "",
  });

  function set(field: keyof DesignInput, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit() {
    if (!form.name.trim()) return;
    onSave(form);
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close"
        className="app-dialog-backdrop absolute inset-0"
        onClick={onClose}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="app-dialog-panel w-full max-w-2xl overflow-hidden">
          {/* Widget header */}
          <div className="widget-header">
            <span className="widget-header__label">
              {design ? "EDIT DESIGN" : "NEW DESIGN"}
            </span>
          </div>

          <div className="p-6">
            <h2 className="mb-5 text-xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
              {design ? "Edit design file" : "Add design file"}
            </h2>

            {/* ── Two-column layout ── */}
            <div className="grid grid-cols-[220px_1fr] gap-6 items-start">

              {/* Left — preview image */}
              <div>
                <p className="mb-2 text-sm font-medium text-[var(--text-2)]">Card preview</p>
                <PreviewImagePicker
                  value={form.previewImageUrl}
                  onChange={(v) => set("previewImageUrl", v)}
                />
              </div>

              {/* Right — form fields */}
              <div className="space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">
                    Name <span className="text-rose-600">*</span>
                  </span>
                  <input
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    className="app-input"
                    placeholder="Main App Design"
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">
                    Figma / Design URL
                  </span>
                  <input
                    value={form.url}
                    onChange={(e) => set("url", e.target.value)}
                    className="app-input"
                    placeholder="https://www.figma.com/file/…"
                    type="url"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">
                    Notes
                  </span>
                  <textarea
                    value={form.notes}
                    onChange={(e) => set("notes", e.target.value)}
                    className="app-input min-h-[100px] resize-y"
                    placeholder="Status, access notes, component library info…"
                  />
                </label>

                {error ? <p className="text-sm text-rose-700">{error}</p> : null}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-6 flex justify-end gap-2 border-t border-[rgba(0,0,0,0.06)] pt-4">
              <Button type="button" variant="secondary" size="md" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                loading={isSaving}
                onClick={handleSubmit}
                disabled={!form.name.trim()}
              >
                {design ? "Save changes" : "Add design file"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
