"use client";

import { createContext, useContext, type ElementType, type KeyboardEvent } from "react";
import { cn } from "@/lib/format";
import {
  fieldText,
  type EditableField,
  type GuidelineOverrides,
  type GuidelinePage,
} from "@/lib/guidelines/content";

interface GuideContextValue {
  overrides: GuidelineOverrides;
  /** True while an admin has switched on "Edit text". */
  editing: boolean;
  setField: (page: GuidelinePage, field: EditableField, value: string) => void;
  goTo: (pageId: string) => void;
}

const GuideContext = createContext<GuideContextValue>({
  overrides: {},
  editing: false,
  setField: () => {},
  goTo: () => {},
});

export const GuideProvider = GuideContext.Provider;

export function useGuide(): GuideContextValue {
  return useContext(GuideContext);
}

/**
 * One editable line of copy on a slide. Read-only it is plain text; in edit mode it becomes a
 * plain-text field (no formatting can be pasted in) that saves on blur. Clearing a field, or
 * typing the default back, removes the edit rather than storing a copy of the default.
 */
export function GuideText({
  page,
  field,
  as: Tag = "div",
  className,
  style,
  singleLine = false,
}: {
  page: GuidelinePage;
  field: EditableField;
  as?: ElementType;
  className?: string;
  style?: React.CSSProperties;
  singleLine?: boolean;
}) {
  const { overrides, editing, setField } = useGuide();
  const text = fieldText(overrides, page, field);
  if (!editing) {
    return (
      <Tag className={className} style={style}>
        {text}
      </Tag>
    );
  }

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    // Arrow keys, "/" and Escape drive the deck everywhere else; inside a field they are text.
    e.stopPropagation();
    if (e.key === "Escape") {
      e.currentTarget.innerText = text;
      e.currentTarget.blur();
    } else if (singleLine && e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    }
  }

  return (
    <Tag
      // Re-mount when the saved text changes, so an uncontrolled field never shows a stale draft.
      key={text}
      role="textbox"
      aria-label={`Edit ${field}`}
      aria-multiline={!singleLine}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck
      className={cn(className, "gl-editable")}
      style={style}
      onKeyDown={onKeyDown}
      onBlur={(e: React.FocusEvent<HTMLElement>) => {
        const next = e.currentTarget.innerText.replace(/\s+\n/g, "\n").trim();
        if (next !== text) setField(page, field, next);
      }}
    >
      {text}
    </Tag>
  );
}
