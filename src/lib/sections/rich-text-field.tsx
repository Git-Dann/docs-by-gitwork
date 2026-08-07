"use client";

/**
 * The rich-text field, on a real editor.
 *
 * Drop-in for both outgoing substrates — `InlineTextArea` (a transparent <textarea> that shows
 * literal `**asterisks**`) and `RichInlineEditor` (a contenteditable driven by regex Markdown and
 * `document.execCommand`). Both take exactly these props and both register the same `FormatTarget`,
 * which is what makes this a swap at the call sites rather than 25 rewrites.
 *
 * ⚠️ `"use client"` is REQUIRED, not stylistic. `sections/registry` is imported by server code
 * (`src/server/document-ai.ts` and the AI chat route), and the registry imports every block file.
 * Without the directive, ProseMirror's browser-only code follows that import into the server
 * bundle. Same boundary `inline-text.tsx` and `format-target.tsx`
 * already hold.
 *
 * Markdown stays the stored format (19 files render it back out), so everything here goes through
 * `markdown-doc.ts`, which is held to the same corpus the old engine was measured against.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { docExtensions, docToMarkdown, markdownToDoc } from "@/lib/sections/markdown-doc";
import { useCanvasActions } from "@/lib/sections/canvas-actions";
import {
  useFormatTargetRegistration,
  type FormatCommand,
} from "@/lib/sections/format-target";

/**
 * Is this field's content the block-menu gesture rather than something the author wrote?
 *
 * True only when the field holds EXACTLY a slash — which happens when you type `/` into an empty
 * field, or select-all and type `/`. Both are deliberate.
 *
 * Everything else is content. A `/` mid-sentence is a real character (dates, paths, "and/or"), and
 * hijacking it would make the editor feel possessed. Exported so the rule can be asserted directly:
 * jsdom will not drive ProseMirror's text-input path, so a test that "typed" a slash would be
 * simulating the thing it claims to check.
 */
export function isBlockMenuTrigger(markdown: string): boolean {
  return markdown === "/";
}

const COMMANDS: ReadonlySet<FormatCommand> = new Set<FormatCommand>([
  "bold",
  "italic",
  "link",
  "code",
  "bullets",
  "numbers",
]);

export function RichTextField({
  value: rawValue,
  onChange,
  placeholder,
  className,
  style,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Typography classes — applied to the WRAPPER; the field inherits them. */
  className?: string;
  /** Inline typography (for blocks that style via `style`) — applied to the wrapper. */
  style?: CSSProperties;
  ariaLabel?: string;
}) {
  // ⚠️ Typed as a required string, but a caller can hand this real, stored data for a field that
  // did not exist when an older document was created — the type says `string`, the row says
  // `undefined`. `InlineTextArea` (the plain <textarea> this replaces) tolerated that silently;
  // `.trim()` below does not, and an uncaught throw here takes out the whole editor page, not just
  // this field. Coerce once, at the top, rather than trusting every call site to guard it.
  const value = rawValue ?? "";
  const formatId = useId();
  const { register, unregister } = useFormatTargetRegistration();
  // Null on the public, print and preview renders — so there is no slash menu there at all,
  // rather than one that is hidden.
  const canvas = useCanvasActions();
  const canvasRef = useRef(canvas);
  canvasRef.current = canvas;
  const focused = useRef(false);
  const [empty, setEmpty] = useState(!value.trim());

  // The last Markdown WE emitted, so an incoming `value` equal to it can be recognised as our own
  // change echoing back through the draft and skipped.
  //
  // ⚠️ This is an optimisation, not a correctness guard, and the difference matters if you are
  // deciding whether to keep it. The caret is protected by `focused` below — the effect returns
  // early while the field has focus, which is the only time a re-seed could disturb anyone. When
  // the field is NOT focused, ProseMirror already no-ops a `setContent` with identical content.
  // Verified by deleting this line: nothing regressed. Kept because skipping the work is free;
  // do not describe it as the thing that stops the selection jumping.
  const lastEmitted = useRef(value);

  // Same ref discipline as `inline-text.tsx`: the format registry stores `run` ONCE, on focus. A
  // closure over `onChange` captured then would write later edits into a stale handler — the exact
  // bug `editor-staleness.test.tsx` exists for.
  const latest = useRef(onChange);
  latest.current = onChange;

  const editor = useEditor({
    // Shared with the serialiser on purpose — see `docExtensions`. A bare StarterKit here
    // would give the editor nodes the serialiser cannot write.
    extensions: docExtensions,
    content: markdownToDoc(value).toJSON(),
    // Required under Next: rendering the editor during SSR throws in TipTap 3.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
        class:
          "rich-inline-editable min-h-[1.5em] outline-none [&_a]:text-[var(--brand-700)] [&_a]:underline [&_a]:underline-offset-2 [&_code]:rounded [&_code]:bg-[var(--surface-1)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em]",
      },
    },
    onUpdate({ editor: instance }) {
      // Commit on every edit, NOT on blur.
      //
      // `RichInlineEditor` only serialised on blur, so typing in a prose block left the document
      // clean until you clicked away — close the tab first and the edit was gone. The 45
      // `InlineTextArea` fields have always committed per keystroke, so this both matches the
      // majority behaviour and removes a real way to lose work. Serialising ONE field's document
      // is O(field); it is not the whole-document work removed from the keystroke path earlier.
      const markdown = docToMarkdown(instance.state.doc);

      // `/` in an otherwise EMPTY field is the block-menu gesture, not content.
      //
      // Deliberately only when the field is empty. A `/` mid-sentence is a real character — dates,
      // paths, "and/or" — and hijacking it would make the editor feel possessed. Empty-field-only
      // is also the case that matters: you reach for a new block BETWEEN blocks, not mid-thought.
      //
      // The trigger never reaches the document. Clearing it here means an autosave can never
      // persist a stray "/" if the menu is dismissed, and it leaves the field exactly as the
      // author found it. Deferred a microtask because dispatching a transaction from inside
      // ProseMirror's own update handler is re-entrant.
      if (canvasRef.current && isBlockMenuTrigger(markdown)) {
        queueMicrotask(() => instance.commands.clearContent());
        canvasRef.current.insertAfter();
        return;
      }

      lastEmitted.current = markdown;
      setEmpty(!markdown.trim());
      latest.current(markdown);
    },
  });

  // External change (undo, an AI apply, a refetch) → into the editor. Never while focused: that
  // would move the caret out from under whoever is typing.
  useEffect(() => {
    if (!editor || focused.current) return;
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(markdownToDoc(value).toJSON(), { emitUpdate: false });
    setEmpty(!value.trim());
  }, [editor, value]);

  const runCommand = useCallback(
    (command: FormatCommand) => {
      if (!editor) return;
      const chain = editor.chain().focus();
      switch (command) {
        case "bold":
          chain.toggleBold().run();
          break;
        case "italic":
          chain.toggleItalic().run();
          break;
        case "code":
          chain.toggleCode().run();
          break;
        case "bullets":
          chain.toggleBulletList().run();
          break;
        case "numbers":
          // Nesting needs no command of its own — StarterKit binds Tab/Shift-Tab to
          // `sinkListItem`/`liftListItem` inside a list, and the renderer draws the indent.
          chain.toggleOrderedList().run();
          break;
        case "link": {
          // Unchanged from the outgoing behaviour — a real link UI is step 5, not this swap.
          const existing = editor.getAttributes("link").href as string | undefined;
          const href = window.prompt("Link URL", existing ?? "https://");
          if (href === null) return;
          if (!href.trim()) {
            chain.unsetLink().run();
            return;
          }
          chain.extendMarkRange("link").setLink({ href: href.trim() }).run();
          break;
        }
      }
    },
    [editor],
  );

  const commands = useMemo(() => COMMANDS, []);

  // Registering on focus and only unregistering on blur leaks the target if the field unmounts
  // while focused — deleting the selected block does exactly that.
  useEffect(() => () => unregister(formatId), [formatId, unregister]);

  return (
    // ⚠️ Focus is tracked from the DOM (`onFocus`/`onBlur` delegate to focusin/focusout), NOT from
    // TipTap's own `focus`/`blur` events. Those only fire when ProseMirror's view sees the focus
    // itself, so anything that focuses the surface another way leaves the toolbar registered to
    // nothing and every control inert. This is the discipline the outgoing contenteditable already
    // used, and the component test catches the regression by asserting the button is not disabled
    // rather than clicking a dead one and passing.
    <div
      className={`inline-edit relative w-full rounded-[4px] transition-colors focus-within:bg-[var(--surface-brand)]/50 ${className ?? ""}`}
      style={style}
      onFocus={() => {
        focused.current = true;
        register({ id: formatId, commands, run: runCommand });
      }}
      onBlur={() => {
        focused.current = false;
        unregister(formatId);
      }}
    >
      <EditorContent editor={editor} />
      {empty && placeholder ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 top-0 left-0 text-[var(--text-4)]">
          {placeholder}
        </div>
      ) : null}
    </div>
  );
}
