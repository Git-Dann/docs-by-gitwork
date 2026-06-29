/**
 * Section type: `faq` — Q+A pairs. Renders as expandable accordion on the public share page
 * and as flat Q/A pairs in PDF (accordion behaviour is print-hostile).
 */

import { PlusIcon, TrashIcon, QuestionMarkCircleIcon } from "@heroicons/react/24/outline";
import { SimpleForm, FormInput, FormTextArea } from "@/lib/sections/_shared";
import { defineSection } from "@/lib/sections/types";
import { InlineAddButton, InlineRemoveButton, InlineTextArea } from "@/lib/sections/inline-text";
import type { FaqItem, FaqSectionData } from "@/types/proposal";

function newItem(): FaqItem {
  return { question: "", answer: "" };
}

export const faqSection = defineSection<FaqSectionData>({
  key: "faq",
  displayName: "FAQ",
  description: "Question + answer pairs. Renders as accordion online, plain pairs in PDF.",
  category: "narrative",
  icon: QuestionMarkCircleIcon,
  defaultData: { intro: "", items: [newItem(), newItem(), newItem()] },
  defaultTitle: "Frequently asked questions",
  defaultDescription: "Q+A pairs for client questions.",
  aiExpandable: true,
  inlineEditable: true,
  Editor: ({ data, onChange }) => {
    const items = data.items ?? [];

    function update(index: number, patch: Partial<FaqItem>) {
      onChange({ ...data, items: items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
    }

    function add() {
      onChange({ ...data, items: [...items, newItem()] });
    }

    function remove(index: number) {
      if (items.length <= 1) return;
      onChange({ ...data, items: items.filter((_, i) => i !== index) });
    }

    return (
      <SimpleForm>
        <FormTextArea
          label="Intro (optional)"
          value={data.intro ?? ""}
          onChange={(intro) => onChange({ ...data, intro })}
          rows={2}
        />
        {items.map((item, i) => (
          <div key={i} className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                Question {i + 1}
              </span>
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={items.length <= 1}
                aria-label="Remove question"
                className="text-rose-600 hover:text-rose-700 disabled:opacity-30"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2">
              <FormInput
                label="Question"
                value={item.question}
                onChange={(question) => update(i, { question })}
                placeholder="What does the engagement include?"
              />
              <FormTextArea
                label="Answer"
                value={item.answer}
                onChange={(answer) => update(i, { answer })}
                rows={3}
              />
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1 text-sm font-medium text-[var(--brand-700)] hover:underline"
        >
          <PlusIcon className="h-4 w-4" /> Add question
        </button>
      </SimpleForm>
    );
  },
  Preview: ({ data, editable, onChange }) => {
    if (editable && onChange) {
      const list = data.items ?? [];
      return (
        <div className="space-y-3">
          <InlineTextArea
            value={data.intro ?? ""}
            onChange={(intro) => onChange({ ...data, intro })}
            placeholder="Intro (optional)…"
            ariaLabel="FAQ intro"
            className="text-sm leading-7 text-[var(--text-2)]"
          />
          <div className="divide-y divide-[var(--border-3)] rounded-[10px] border border-[var(--border-2)] bg-white">
            {list.map((item, i) => (
              <div key={i} className="group/row flex items-start gap-3 px-5 py-3">
                <span className="pt-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="flex-1 space-y-1">
                  <InlineTextArea
                    value={item.question}
                    onChange={(question) =>
                      onChange({ ...data, items: list.map((it, j) => (j === i ? { ...it, question } : it)) })
                    }
                    placeholder="Question"
                    ariaLabel="Question"
                    className="text-sm font-medium text-[var(--text-1)]"
                  />
                  <InlineTextArea
                    value={item.answer}
                    onChange={(answer) =>
                      onChange({ ...data, items: list.map((it, j) => (j === i ? { ...it, answer } : it)) })
                    }
                    placeholder="Answer…"
                    ariaLabel="Answer"
                    className="text-sm leading-7 text-[var(--text-2)]"
                  />
                </div>
                <span className="pt-1">
                  <InlineRemoveButton onClick={() => onChange({ ...data, items: list.filter((_, j) => j !== i) })} />
                </span>
              </div>
            ))}
          </div>
          <InlineAddButton label="Add question" onClick={() => onChange({ ...data, items: [...list, newItem()] })} />
        </div>
      );
    }
    const items = (data.items ?? []).filter((item) => item.question || item.answer);
    if (items.length === 0) {
      return (
        <p className="text-sm italic text-[var(--text-4)]">
          No questions yet — add some in the editor.
        </p>
      );
    }
    return (
      <div className="proposal-block-avoid space-y-3">
        {data.intro ? <p className="text-sm leading-7 text-[var(--text-2)]">{data.intro}</p> : null}
        <div className="divide-y divide-[var(--border-3)] rounded-[10px] border border-[var(--border-2)] bg-white">
          {items.map((item, i) => (
            <details key={i} className="group">
              <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 px-5 py-3 [&::-webkit-details-marker]:hidden">
                <span className="text-sm font-medium text-[var(--text-1)]">
                  {item.question || "Untitled question"}
                </span>
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)] transition group-open:text-[var(--brand-700)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </summary>
              <div className="px-5 pb-4 pt-0 text-sm leading-7 text-[var(--text-2)]">
                {item.answer || <span className="italic text-[var(--text-4)]">No answer yet.</span>}
              </div>
            </details>
          ))}
        </div>
      </div>
    );
  },
});
