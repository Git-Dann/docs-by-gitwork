/** Section type: `principles_grid` — a numbered grid of principles/values (light, navy, or cards). */

import { Squares2X2Icon } from "@heroicons/react/24/outline";
import { defineSection } from "@/lib/sections/types";
import { SimpleForm } from "@/lib/sections/_shared";
import { RichTextField } from "@/lib/sections/rich-text-lazy";
import { InlineAddButton, InlineRemoveButton } from "@/lib/sections/inline-text";
import type { PrinciplesGridSectionData } from "@/types/proposal";

const num = (i: number) => String(i + 1).padStart(2, "0");

export const principlesGridSection = defineSection<PrinciplesGridSectionData>({
  key: "principles_grid",
  displayName: "Principles grid",
  description: "A numbered grid of principles or values — light, a navy band, or separated cards.",
  category: "lists",
  icon: Squares2X2Icon,
  defaultData: {
    items: [
      { title: "Stable" },
      { title: "Clean" },
      { title: "Free from test data" },
      { title: "Free from unfinished work" },
      { title: "Fully tested" },
      { title: "Ready for customers" },
    ],
    columns: 3,
    style: "dark",
  },
  defaultTitle: "Principles",
  defaultDescription: "A numbered grid of principles.",
  aiExpandable: false,
  inlineEditable: true,
  hasOptions: true,
  Editor: ({ data, onChange }) => {
    const style = data.style ?? "light";
    const items = data.items ?? [];
    const highlightedIndex = items.findIndex((item) => item.highlighted === true);
    const footerOn = Boolean(data.footer);
    return (
      <SimpleForm>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-[var(--text-2)]">Style</span>
          <select
            value={style}
            onChange={(e) => onChange({ ...data, style: e.target.value as PrinciplesGridSectionData["style"] })}
            className="app-select w-full"
          >
            <option value="light">Light</option>
            <option value="dark">Navy</option>
            <option value="cards">Cards (labelled)</option>
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-[var(--text-2)]">Columns</span>
          <select
            value={String(data.columns ?? 3)}
            onChange={(e) => onChange({ ...data, columns: Number(e.target.value) as PrinciplesGridSectionData["columns"] })}
            className="app-select w-full"
          >
            <option value="2">2 columns</option>
            <option value="3">3 columns</option>
          </select>
        </label>

        {/* NOT gated on `style === "cards"`. Every style renders `item.highlighted` — the light
            and dark grids tint the highlighted item's number in the accent — but the control was
            only offered for cards, so on two of the three styles the highlight was visible and
            unchangeable. */}
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-[var(--text-2)]">Highlighted item</span>
          <select
            value={highlightedIndex >= 0 ? String(highlightedIndex) : ""}
            onChange={(e) => {
              const next = e.target.value === "" ? -1 : Number(e.target.value);
              onChange({
                ...data,
                items: items.map((item, i) => ({ ...item, highlighted: i === next })),
              });
            }}
            className="app-select w-full"
          >
            <option value="">None</option>
            {items.map((item, i) => (
              <option key={i} value={String(i)}>
                {num(i)} — {item.title || "Untitled"}
              </option>
            ))}
          </select>
        </label>

        {style === "cards" ? (
          <>
            <label className="flex items-center gap-2 text-sm text-[var(--text-2)]">
              <input
                type="checkbox"
                checked={footerOn}
                onChange={(e) => onChange({ ...data, footer: e.target.checked ? (data.footer ?? {}) : undefined })}
                className="app-checkbox"
              />
              Full-width footer card
            </label>
          </>
        ) : null}

        <p className="text-xs leading-5 text-[var(--text-4)]">
          {style === "cards"
            ? "Each card’s label, title and body — and the footer card — are edited inline on the canvas."
            : "Each item’s title and detail are edited inline on the canvas."}
        </p>
      </SimpleForm>
    );
  },
  Preview: ({ data, editable, onChange }) => {
    const items = data.items ?? [];
    const columns = data.columns ?? 3;
    const style = data.style ?? "light";
    const dark = style === "dark";
    const cards = style === "cards";
    const colClass = columns === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3";

    if (editable && onChange) {
      const update = (i: number, patch: Partial<PrinciplesGridSectionData["items"][number]>) =>
        onChange({ ...data, items: items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
      return (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {items.map((item, i) => (
              <div
                key={i}
                className="group/row rounded-[10px] border p-3"
                style={
                  cards && item.highlighted
                    ? { borderColor: "var(--doc-accent, #4f5bd5)", background: "var(--doc-accent-tint, rgba(79,91,213,0.12))" }
                    : { borderColor: "var(--border-2)", background: "#fff" }
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="font-mono text-[10px] font-semibold text-[var(--text-4)]">{num(i)}</span>
                    {cards ? (
                      <span className="min-w-0 flex-1">
                        <RichTextField
                          value={item.label ?? ""}
                          onChange={(label) => update(i, { label })}
                          placeholder="/ LABEL"
                          ariaLabel={`Principle ${i + 1} label`}
                          className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-4)]"
                        />
                      </span>
                    ) : null}
                  </span>
                  <InlineRemoveButton onClick={() => onChange({ ...data, items: items.filter((_, j) => j !== i) })} />
                </div>
                <RichTextField
                  value={item.title}
                  onChange={(title) => update(i, { title })}
                  placeholder="Title"
                  ariaLabel={`Principle ${i + 1} title`}
                  className="mt-1 font-[family-name:var(--font-display)] text-[18px] leading-tight text-[var(--text-1)]"
                />
                <RichTextField
                  value={item.detail ?? ""}
                  onChange={(detail) => update(i, { detail })}
                  placeholder="Detail (optional)"
                  ariaLabel={`Principle ${i + 1} detail`}
                  className="mt-1 text-[13px] leading-6 text-[var(--text-3)]"
                />
              </div>
            ))}
          </div>
          <InlineAddButton label="Add principle" onClick={() => onChange({ ...data, items: [...items, { title: "" }] })} />
          {cards && data.footer ? (
            <div className="rounded-[10px] border border-[var(--border-2)] bg-white p-3">
              <RichTextField
                value={data.footer.title ?? ""}
                onChange={(title) => onChange({ ...data, footer: { ...(data.footer ?? {}), title } })}
                placeholder="Footer card title"
                ariaLabel="Footer card title"
                className="font-[family-name:var(--font-display)] text-[18px] leading-tight text-[var(--text-1)]"
              />
              <RichTextField
                value={data.footer.body ?? ""}
                onChange={(body) => onChange({ ...data, footer: { ...(data.footer ?? {}), body } })}
                placeholder="Footer card body (optional)"
                ariaLabel="Footer card body"
                className="mt-1 text-[13px] leading-6 text-[var(--text-3)]"
              />
            </div>
          ) : null}
        </div>
      );
    }

    if (items.length === 0) return null;

    if (dark) {
      return (
        <div className="proposal-block-avoid overflow-hidden rounded-[14px]" style={{ background: "linear-gradient(135deg, #14132b 0%, #0f172a 60%, #191740 100%)" }}>
          <div className={`grid ${colClass}`}>
            {items.map((item, i) => (
              <div key={i} className="border-b border-white/10 p-5 sm:border-r [&:last-child]:border-b-0">
                <p className="font-mono text-[11px] font-semibold text-white/45">{num(i)}</p>
                <p className="mt-3 font-[family-name:var(--font-display)] text-[20px] leading-tight text-white">{item.title}</p>
                {item.detail ? <p className="mt-1.5 text-[13px] leading-6 text-white/60">{item.detail}</p> : null}
              </div>
            ))}
          </div>
        </div>
      );
    }

    // ── Cards — mono `NN / LABEL` eyebrow, serif title, muted body; one card can be accented, ──
    // ── with an optional full-width footer card below the grid.                              ──
    if (cards) {
      const footerTitle = data.footer?.title?.trim();
      const footerBody = data.footer?.body?.trim();
      return (
        <div className={`proposal-block-avoid grid gap-3 ${colClass}`}>
          {items.map((item, i) => (
            <div
              key={i}
              className="rounded-[10px] border p-5"
              style={
                item.highlighted
                  ? {
                      borderColor: "var(--doc-accent, #4f5bd5)",
                      background: "var(--doc-accent-tint, rgba(79,91,213,0.12))",
                    }
                  : {
                      borderColor: "var(--doc-line, rgba(0,0,0,0.14))",
                      background: "var(--doc-panel, #f7f5ef)",
                    }
              }
            >
              <p
                className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: item.highlighted ? "var(--doc-accent, #4f5bd5)" : "var(--doc-muted, #8a867c)" }}
              >
                {num(i)}
                {item.label?.trim() ? ` / ${item.label.trim().toUpperCase()}` : ""}
              </p>
              <p
                className="mt-3 font-[family-name:var(--font-display)] text-[20px] leading-tight"
                style={{ color: "var(--doc-ink, #1a1a17)" }}
              >
                {item.title}
              </p>
              {item.detail ? (
                <p className="mt-1.5 text-[13px] leading-6" style={{ color: "var(--doc-ink-soft, #4b4a44)" }}>
                  {item.detail}
                </p>
              ) : null}
            </div>
          ))}
          {footerTitle || footerBody ? (
            <div
              className="rounded-[10px] border p-5"
              style={{
                gridColumn: "1 / -1",
                borderColor: "var(--doc-line, rgba(0,0,0,0.14))",
                background: "var(--doc-panel, #f7f5ef)",
              }}
            >
              {footerTitle ? (
                <p
                  className="font-[family-name:var(--font-display)] text-[20px] leading-tight"
                  style={{ color: "var(--doc-ink, #1a1a17)" }}
                >
                  {footerTitle}
                </p>
              ) : null}
              {footerBody ? (
                <p
                  className={`text-[13px] leading-6 ${footerTitle ? "mt-1.5" : ""}`}
                  style={{ color: "var(--doc-ink-soft, #4b4a44)" }}
                >
                  {footerBody}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <div className={`proposal-block-avoid grid gap-3 ${colClass}`}>
        {items.map((item, i) => (
          <div key={i} className="rounded-[10px] border border-[var(--doc-line,rgba(0,0,0,0.14))] bg-[var(--doc-panel,#f7f5ef)] p-5">
            <p className="font-mono text-[11px] font-semibold text-[var(--doc-muted,#8a867c)]">{num(i)}</p>
            <p className="mt-3 font-[family-name:var(--font-display)] text-[20px] leading-tight text-[var(--doc-ink,#1a1a17)]">{item.title}</p>
            {item.detail ? <p className="mt-1.5 text-[13px] leading-6 text-[var(--doc-ink-soft,#4b4a44)]">{item.detail}</p> : null}
          </div>
        ))}
      </div>
    );
  },
});
