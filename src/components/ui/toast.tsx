"use client";

/**
 * Lightweight toast system.
 *
 * A single ToastProvider mounted in app-providers exposes useToast() app-wide.
 * Toasts stack bottom-right (bottom-centre on mobile), auto-dismiss, and are
 * themed with the shared CSS variables so they follow light/dark. Accessible:
 * the viewport is an aria-live region and each toast is dismissable.
 *
 * Usage:
 *   const { success, error, undo } = useToast();
 *   success("Task created");
 *   error("Couldn't save", "Please try again.");
 *   undo("Request marked dealt with", () => reopen());   // an Undo toast
 *
 * ── Undo toasts ─────────────────────────────────────────────────────────────
 * A toast with an action renders EasyUI's Undo Toast (vendored, MIT —
 * `src/components/ui/easyui/undo-toast.tsx`, licence in docs/third-party-ui.md).
 *
 * The contract: the action has ALREADY been performed, and Undo runs its inverse. Nothing is
 * deferred, so a toast that times out, is closed or is pushed off the stack leaves the change
 * exactly as it was made. Only offer Undo where a real inverse exists server-side (reopen,
 * restore a soft-deleted row) — never over a hard delete. If the inverse throws, the toast
 * closes and an error toast says the undo didn't happen.
 *
 * Undo toasts stay up 8s, show a countdown bar, and pause while hovered or while focus is
 * inside them. Escape closes a focused toast. Reduced motion: no spring, no bar.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence } from "framer-motion";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { UndoToast, type UndoToastVariant } from "@/components/ui/easyui/undo-toast";

type ToastVariant = "success" | "error" | "info";

export type ToastAction = {
  /** Button label, e.g. "Undo". */
  label: string;
  /** Runs when the button is pressed. A rejected promise is reported as an error toast. */
  onAction: () => unknown;
};

type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Auto-dismiss delay in ms (default 3500; errors 5000; action toasts 8000). */
  duration?: number;
  action?: ToastAction;
  /** Icon tone of an action toast (EasyUI's variants). Defaults to "default" (a bin). */
  actionVariant?: UndoToastVariant;
};

type ToastItem = {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration: number;
  action?: ToastAction;
  actionVariant?: UndoToastVariant;
};

type UndoOptions = { description?: string; duration?: number; variant?: UndoToastVariant };

type ToastApi = {
  toast: (input: ToastInput) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  /**
   * Report an action that has ALREADY happened, with an Undo button that runs `onUndo`.
   * Only use where `onUndo` is a genuine, safe inverse (see the file header).
   */
  undo: (title: string, onUndo: () => unknown, opts?: UndoOptions) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export const DEFAULT_DURATION = 3500;
export const ERROR_DURATION = 5000;
export const ACTION_DURATION = 8000;
const MAX_VISIBLE = 4;
let counter = 0;

function durationFor(input: ToastInput, variant: ToastVariant): number {
  if (input.duration !== undefined) return input.duration;
  if (input.action) return ACTION_DURATION;
  return variant === "error" ? ERROR_DURATION : DEFAULT_DURATION;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((input: ToastInput) => {
    const id = ++counter;
    const variant = input.variant ?? "info";
    setItems((prev) => [
      ...prev.slice(-(MAX_VISIBLE - 1)),
      {
        id,
        variant,
        title: input.title,
        description: input.description,
        duration: durationFor(input, variant),
        action: input.action,
        actionVariant: input.actionVariant,
      },
    ]);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (title, description) => toast({ title, description, variant: "success" }),
      error: (title, description) => toast({ title, description, variant: "error" }),
      info: (title, description) => toast({ title, description, variant: "info" }),
      undo: (title, onUndo, opts) =>
        toast({
          title,
          description: opts?.description,
          duration: opts?.duration,
          actionVariant: opts?.variant,
          action: { label: "Undo", onAction: onUndo },
        }),
    }),
    [toast],
  );

  const onActionError = useCallback(
    (label: string, err: unknown) => {
      toast({
        title: `Couldn't ${label.toLowerCase()}`,
        description: err instanceof Error && err.message ? err.message : "Please try again.",
        variant: "error",
      });
    },
    [toast],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport items={items} onDismiss={dismiss} onActionError={onActionError} />
    </ToastContext.Provider>
  );
}

const NOOP: ToastApi = {
  toast: () => {},
  success: () => {},
  error: () => {},
  info: () => {},
  undo: () => {},
};

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  // Defensive no-op when used outside a provider (isolated trees / tests) so a
  // missing provider can never crash an action handler.
  return ctx ?? NOOP;
}

const VARIANT_META: Record<
  ToastVariant,
  { icon: typeof CheckCircleIcon; accent: string }
> = {
  success: { icon: CheckCircleIcon, accent: "var(--success-500)" },
  error: { icon: ExclamationTriangleIcon, accent: "var(--danger-500)" },
  info: { icon: InformationCircleIcon, accent: "var(--brand-600)" },
};

function ToastViewport({
  items,
  onDismiss,
  onActionError,
}: {
  items: ToastItem[];
  onDismiss: (id: number) => void;
  onActionError: (label: string, err: unknown) => void;
}) {
  return (
    <div
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end"
    >
      <style>{TOAST_STYLES}</style>
      <AnimatePresence initial={false}>
        {items.map((t) =>
          t.action ? (
            <UndoToast
              key={t.id}
              stacked
              title={t.title}
              description={t.description}
              undoLabel={t.action.label}
              variant={t.actionVariant ?? "default"}
              duration={t.duration}
              onUndo={t.action.onAction}
              onUndoError={(err) => onActionError(t.action!.label, err)}
              onDismiss={() => onDismiss(t.id)}
              className="w-full sm:w-auto"
            />
          ) : (
            <ToastCard key={t.id} item={t} onDismiss={onDismiss} />
          ),
        )}
      </AnimatePresence>
    </div>
  );
}

/** A plain toast. It owns its timer, and pauses while hovered or focused. */
function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(item.duration);
  const paused = hovered || focused;

  useEffect(() => {
    if (paused) return;
    const startedAt = Date.now();
    const timer = setTimeout(() => onDismiss(item.id), Math.max(0, remaining.current));
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [paused, item.id, onDismiss]);

  const meta = VARIANT_META[item.variant];
  const Icon = meta.icon;
  return (
    <div
      role="status"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      style={{ borderLeftColor: meta.accent }}
      className={cn(
        "gitwork-toast pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[10px] border border-l-[3px] border-[var(--border-2)]",
        "bg-[var(--surface-0)] px-3.5 py-3 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.28)]",
      )}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" style={{ color: meta.accent }} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--text-1)]">{item.title}</p>
        {item.description ? (
          <p className="mt-0.5 text-[13px] leading-snug text-[var(--text-3)]">{item.description}</p>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => onDismiss(item.id)}
        className="shrink-0 rounded-[5px] p-0.5 text-[var(--text-4)] transition hover:text-[var(--text-1)]"
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

export const TOAST_STYLES = `@keyframes gitwork-toast-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.gitwork-toast { animation: gitwork-toast-in 180ms ease-out; }
@media (prefers-reduced-motion: reduce) {
  .gitwork-toast { animation: none; }
}`;
