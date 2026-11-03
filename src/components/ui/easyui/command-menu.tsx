"use client";

/*
 * Vendored from EasyUI — https://easyui.site/components/command-menu
 * Source: github.com/Surajmaurya1/easyui, src/components/ui/CommandMenu.tsx
 * MIT License, Copyright (c) 2026 Suraj Maurya. Full text: docs/third-party-ui.md.
 *
 * Kept as EasyUI built it: the layout, the spring entrance, the blurred backdrop, the row with its
 * category label and the ↵ marker on the selected row, the footer hints.
 *
 * Changed for Foundry, and only this:
 *   - Items come in as props instead of EasyUI's own catalogue, and ranking is a prop (Foundry passes
 *     its fuzzy matcher, which groups results and forgives typos).
 *   - Colours are Foundry tokens, so it reads in light and dark (EasyUI is dark only).
 *   - lucide icons swapped for the heroicons Foundry already ships.
 *   - It is a real dialog: focus moves in on open, Tab is trapped, focus returns on close, and the
 *     selected row scrolls into view. Reduced motion skips the spring.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type Transition } from "framer-motion";
import { ArrowTurnDownLeftIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";

/** EasyUI's springSnappy (src/lib/motion-tokens.ts). */
const springSnappy: Transition = { type: "spring", stiffness: 380, damping: 30, mass: 0.5 };

export interface EasyCommandItem {
  id: string;
  title: string;
  category: string;
  icon: React.ReactNode;
  shortcut?: string;
  onSelect: () => void;
}

export interface EasyCommandMenuProps {
  isOpen: boolean;
  onClose: () => void;
  items: EasyCommandItem[];
  /** How a query narrows the items. EasyUI's default is a substring match on title or category. */
  rank?: (items: EasyCommandItem[], query: string) => EasyCommandItem[];
  placeholder?: string;
  footerLabel?: string;
}

const substring = (items: EasyCommandItem[], query: string) =>
  items.filter(
    (item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.category.toLowerCase().includes(query.toLowerCase()),
  );

export const EasyCommandMenu: React.FC<EasyCommandMenuProps> = ({
  isOpen,
  onClose,
  items,
  rank = substring,
  placeholder = "Type a command or search…",
  footerLabel = "Foundry",
}) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  const filteredItems = useMemo(() => rank(items, query), [items, query, rank]);

  // Fresh each time it opens; focus in, and back to wherever it came from on close.
  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setSelectedIndex(0);
    restoreRef.current = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (filteredItems.length || 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % (filteredItems.length || 1));
      } else if (e.key === "Enter" && filteredItems[selectedIndex]) {
        e.preventDefault();
        filteredItems[selectedIndex].onSelect();
      } else if (e.key === "Tab" && panelRef.current) {
        // Keep Tab inside the dialog.
        const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>("input, button"));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filteredItems, selectedIndex, onClose]);

  // Keep the selected row in view as the arrows move it.
  useEffect(() => {
    const id = filteredItems[selectedIndex]?.id;
    if (!isOpen || !id) return;
    panelRef.current?.querySelector(`[data-command-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [isOpen, filteredItems, selectedIndex]);

  const instant: Transition = { duration: 0 };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-20 sm:px-6"
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduceMotion ? instant : undefined}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Palette Container */}
          <motion.div
            ref={panelRef}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -8 }}
            transition={reduceMotion ? instant : springSnappy}
            className="relative z-10 w-full max-w-xl overflow-hidden rounded-xl border border-[var(--border-1)] bg-[var(--surface-0)] shadow-[0_24px_60px_rgba(0,0,0,0.35)]"
          >
            {/* Search Input Bar */}
            <div className="flex items-center border-b border-[var(--border-1)] px-4 py-3">
              <MagnifyingGlassIcon aria-hidden className="mr-2.5 h-4 w-4 shrink-0 text-[var(--text-4)]" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                placeholder={placeholder}
                aria-label={placeholder}
                // Inline: Foundry's global :focus-visible ring is unlayered CSS (CLAUDE.md §69).
                style={{ outline: "none" }}
                className="w-full bg-transparent text-[16px] text-[var(--text-1)] placeholder-[var(--text-4)] focus:outline-none"
              />
              <span className="rounded border border-[var(--border-1)] bg-[var(--surface-1)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-4)]">
                ESC
              </span>
            </div>

            {/* Results List */}
            <div className="max-h-80 overflow-y-auto p-1.5" role="listbox" aria-label="Results">
              {filteredItems.length === 0 ? (
                <div className="py-8 text-center text-xs text-[var(--text-4)]">
                  {query.trim() ? <>No results matching &quot;{query}&quot;</> : "Nothing to show yet"}
                </div>
              ) : (
                <div className="space-y-0.5">
                  {filteredItems.map((item, idx) => {
                    const isSelected = idx === selectedIndex;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-command-id={item.id}
                        onClick={item.onSelect}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        role="option"
                        aria-selected={isSelected}
                        className={cn(
                          "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs transition-colors",
                          isSelected
                            ? "bg-[var(--surface-1)] text-[var(--text-1)]"
                            : "text-[var(--text-2)] hover:bg-[var(--surface-1)]",
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          {item.icon}
                          <span className="truncate font-normal" title={item.title}>
                            {item.title}
                          </span>
                          <span className="ml-1 shrink-0 text-[10px] text-[var(--text-4)]">{item.category}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {isSelected && <ArrowTurnDownLeftIcon aria-hidden className="h-3 w-3 text-[var(--text-1)]" />}
                          {item.shortcut && (
                            <span className="rounded border border-[var(--border-1)] bg-[var(--surface-0)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-4)]">
                              {item.shortcut}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer status */}
            <div className="flex items-center justify-between border-t border-[var(--border-1)] bg-[var(--surface-0)] px-4 py-2 text-[11px] text-[var(--text-4)]">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="rounded border border-[var(--border-1)] bg-[var(--surface-1)] px-1 font-mono text-[10px] text-[var(--text-3)]">
                    ↑↓
                  </span>{" "}
                  navigate
                </span>
                <span className="flex items-center gap-1">
                  <span className="rounded border border-[var(--border-1)] bg-[var(--surface-1)] px-1 font-mono text-[10px] text-[var(--text-3)]">
                    ↵
                  </span>{" "}
                  select
                </span>
              </div>
              <span>{footerLabel}</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
