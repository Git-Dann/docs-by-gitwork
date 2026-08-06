"use client";

/**
 * The document editor's ONE formatting bar — persistent, in the toolbar's editing row.
 *
 * It replaced a floating bar that only appeared on selection. That bar worked, and nobody knew it
 * existed: formatting you cannot see is formatting nobody uses, which is the same failure as the
 * code block that shipped registered and went unfound. Every document editor people already know
 * — Google Docs, Notion, Slack's own composer — puts this bar in a fixed place, and there is no
 * reason to make Foundry the exception.
 *
 * **Enablement is honest.** Controls are inert until a field that supports them holds focus, and
 * each control is enabled independently — the focused field declares its own command set, so a
 * plain-string field lights bold/italic/link/code/bullets while a numeric input lights nothing.
 * A bar that is always lit but silently does nothing teaches people the buttons are broken.
 */

import {
  BoldIcon,
  CodeBracketIcon,
  ItalicIcon,
  LinkIcon,
  ListBulletIcon,
  NumberedListIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import {
  formatButtonMouseDown,
  useFormatTarget,
  type FormatCommand,
} from "@/lib/sections/format-target";

const CONTROLS: Array<{
  command: FormatCommand;
  label: string;
  hint: string;
  icon: (props: React.ComponentProps<"svg">) => React.ReactNode;
}> = [
  { command: "bold", label: "Bold", hint: "Bold (⌘B)", icon: BoldIcon },
  { command: "italic", label: "Italic", hint: "Italic (⌘I)", icon: ItalicIcon },
  { command: "bullets", label: "Bulleted list", hint: "Bulleted list", icon: ListBulletIcon },
  // Numbered lists became offerable only when `renderLines` learned to draw them. Before that a
  // button here would have written `1. ` into a field the client's page rendered as literal text.
  { command: "numbers", label: "Numbered list", hint: "Numbered list", icon: NumberedListIcon },
  { command: "link", label: "Link", hint: "Link (⌘K)", icon: LinkIcon },
  { command: "code", label: "Code", hint: "Inline code", icon: CodeBracketIcon },
];

export function DocumentFormatBar({ className }: { className?: string }) {
  const target = useFormatTarget();

  return (
    <div
      className={cn("flex shrink-0 items-center gap-0.5", className)}
      role="toolbar"
      aria-label="Text formatting"
    >
      {CONTROLS.map(({ command, label, hint, icon: Icon }) => {
        const active = target?.commands.has(command) ?? false;
        return (
          <button
            key={command}
            type="button"
            // Disabled rather than hidden: a bar whose controls come and go is harder to learn
            // than one whose controls dim. The shape of the toolbar stays constant.
            disabled={!active}
            aria-label={label}
            title={active ? hint : `${label} — click into some text first`}
            onMouseDown={formatButtonMouseDown}
            onClick={() => target?.run(command)}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-[6px] border transition",
              active
                ? "border-transparent text-[var(--text-2)] hover:border-[var(--border-2)] hover:bg-white hover:text-[var(--text-1)]"
                : // Inert state: no border, no hover, and NOT `cursor-not-allowed` — this is a
                  // control waiting for context, not a refusal.
                  "cursor-default border-transparent text-[var(--text-4)] opacity-45",
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
