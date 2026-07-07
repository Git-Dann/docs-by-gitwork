"use client";

/**
 * Lightweight, dependency-free toast system.
 *
 * A single ToastProvider mounted in app-providers exposes useToast() app-wide.
 * Toasts stack bottom-right (bottom-centre on mobile), auto-dismiss, and are
 * themed with the shared CSS variables so they follow light/dark. Accessible:
 * the viewport is an aria-live region and each toast is dismissable.
 *
 * Usage:
 *   const { success, error } = useToast();
 *   success("Task created");
 *   error("Couldn't save", "Please try again.");
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
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";

type ToastVariant = "success" | "error" | "info";
type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Auto-dismiss delay in ms (default 3500; errors default 5000). */
  duration?: number;
};
type ToastItem = Required<Pick<ToastInput, "title" | "variant">> &
  Pick<ToastInput, "description"> & { id: number };

type ToastApi = {
  toast: (input: ToastInput) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const DEFAULT_DURATION = 3500;
const ERROR_DURATION = 5000;
const MAX_VISIBLE = 4;
let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = ++counter;
      const variant = input.variant ?? "info";
      setItems((prev) => [
        ...prev.slice(-(MAX_VISIBLE - 1)),
        { id, variant, title: input.title, description: input.description },
      ]);
      const duration = input.duration ?? (variant === "error" ? ERROR_DURATION : DEFAULT_DURATION);
      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  // Clear any pending timers on unmount.
  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (title, description) => toast({ title, description, variant: "success" }),
      error: (title, description) => toast({ title, description, variant: "error" }),
      info: (title, description) => toast({ title, description, variant: "info" }),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

const NOOP: ToastApi = {
  toast: () => {},
  success: () => {},
  error: () => {},
  info: () => {},
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
}: {
  items: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end"
    >
      <style>{TOAST_KEYFRAMES}</style>
      {items.map((t) => {
        const meta = VARIANT_META[t.variant];
        const Icon = meta.icon;
        return (
          <div
            key={t.id}
            role="status"
            style={{ animation: "gitwork-toast-in 180ms ease-out", borderLeftColor: meta.accent }}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[10px] border border-l-[3px] border-[var(--border-2)]",
              "bg-[var(--surface-0)] px-3.5 py-3 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.28)]",
            )}
          >
            <Icon className="mt-0.5 h-5 w-5 shrink-0" style={{ color: meta.accent }} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--text-1)]">{t.title}</p>
              {t.description ? (
                <p className="mt-0.5 text-[13px] leading-snug text-[var(--text-3)]">{t.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => onDismiss(t.id)}
              className="shrink-0 rounded-[5px] p-0.5 text-[var(--text-4)] transition hover:text-[var(--text-1)]"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

const TOAST_KEYFRAMES = `@keyframes gitwork-toast-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}`;
