'use client';

/**
 * Undo Toast — vendored from EasyUI.
 *
 * Source:  https://github.com/Surajmaurya1/easyui — `src/components/ui/UndoToast.tsx`
 *          (spring values from `src/lib/motion-tokens.ts`, `springSnappy`)
 * Docs:    https://easyui.site/components/undo-toast
 * Licence: MIT, Copyright (c) 2026 Suraj Maurya — full text in docs/third-party-ui.md.
 *
 * The look, the countdown bar, pause-on-hover and the spring motion are EasyUI's. What was
 * changed for Foundry, and only this:
 *
 *  - Imports: `cn` from `@/lib/format`; icons from Heroicons (Foundry's icon set — lucide is
 *    not a dependency here) mapped one-for-one; the `springSnappy` token inlined.
 *  - Colours: EasyUI is dark-only (#0E0E0E / #1F1F1F / #FAFAFA …). Every hex is mapped to a
 *    Foundry token so the toast works in light AND dark: surface-0 / surface-1 / border-2 /
 *    text-1 / text-3 / text-4, and the variant icons to success / warning / danger / brand.
 *  - Accessibility: the timer also pauses while focus is inside the toast (a keyboard user
 *    reaching Undo must not race the clock), Escape dismisses, and the title/description
 *    carry a `title` so truncated text is recoverable.
 *  - prefers-reduced-motion: no spring entrance/exit and no countdown bar; the timer runs.
 *  - Pause maths: upstream restarted the bar at 100% after a hover (its fraction was taken
 *    against the time LEFT, not the full duration), and from the second hover on computed
 *    the time left against the wrong total. The bar now always reports remaining ÷ duration.
 *  - Undo may return a promise: "Restored" is shown only once it resolves, and a rejection
 *    is handed to `onUndoError` instead of claiming success.
 *  - `stacked`: renders just the card (no fixed wrapper, no own AnimatePresence) so Foundry's
 *    `ToastProvider` can stack it with its other toasts and own the presence.
 *  - Dismissal is a `setTimeout`; requestAnimationFrame only drives the bar.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion, type Transition } from 'framer-motion';
import {
  CheckIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
  TrashIcon,
  ArrowUturnLeftIcon,
} from '@heroicons/react/24/outline';
import { cn } from '@/lib/format';

/** EasyUI `motionTransitions.springSnappy`. */
const springSnappy: Transition = { type: 'spring', stiffness: 380, damping: 30, mass: 0.5 };
const instant: Transition = { duration: 0 };

export type UndoToastVariant = 'default' | 'success' | 'warning' | 'error' | 'info';
export type UndoToastPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export interface UndoToastProps {
  /** Visibility state */
  open?: boolean;
  /** Toast message title (e.g. "File deleted") */
  title?: string;
  /** Secondary description or metadata */
  description?: string;
  /** Undo action button label */
  undoLabel?: string;
  /** Restored state message when Undo is triggered */
  restoredMessage?: string;
  /** Duration in milliseconds before automatic dismissal */
  duration?: number;
  /** Toast variant visual tone */
  variant?: UndoToastVariant;
  /** Toast screen placement (ignored when `stacked`) */
  position?: UndoToastPosition;
  /** Callback fired when user clicks Undo. May return a promise. */
  onUndo?: () => unknown;
  /** Foundry: called when `onUndo` rejects. The toast dismisses rather than showing "restored". */
  onUndoError?: (err: unknown) => void;
  /** Callback fired when toast finishes timer or is closed */
  onDismiss?: () => void;
  /** Whether to show the countdown bar */
  showProgress?: boolean;
  /** Custom icon */
  icon?: React.ReactNode;
  /** Custom class name */
  className?: string;
  /** Foundry: render only the card, for a parent that stacks toasts and owns presence. */
  stacked?: boolean;
}

/** How long the "Restored" confirmation stays before the toast leaves (EasyUI's 1400ms). */
export const RESTORED_HOLD_MS = 1400;

export const UndoToast: React.FC<UndoToastProps> = ({
  open = true,
  title = 'Project archived',
  description = 'Changes will be permanent in a few seconds',
  undoLabel = 'Undo',
  restoredMessage = 'Restored successfully',
  duration = 5000,
  variant = 'default',
  position = 'bottom-center',
  onUndo,
  onUndoError,
  onDismiss,
  showProgress = true,
  icon,
  className,
  stacked = false,
}) => {
  const reduceMotion = useReducedMotion();
  const [isVisible, setIsVisible] = useState(open);
  const [isRestored, setIsRestored] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [progress, setProgress] = useState(100);
  const isPaused = isHovered || isFocused;

  const remainingTimeRef = useRef<number>(duration);
  const requestRef = useRef<number | null>(null);

  useEffect(() => {
    setIsVisible(open);
    if (open) {
      setIsRestored(false);
      setProgress(100);
      remainingTimeRef.current = duration;
    }
  }, [open, duration]);

  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    onDismiss?.();
  }, [onDismiss]);

  const handleUndoClick = async () => {
    if (isRestored || isRestoring) return;
    setIsRestoring(true);
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    try {
      await onUndo?.();
    } catch (err) {
      handleDismiss();
      onUndoError?.(err);
      return;
    }
    setIsRestored(true);
    setTimeout(() => {
      handleDismiss();
    }, RESTORED_HOLD_MS);
  };

  useEffect(() => {
    if (!isVisible || isRestored || isRestoring || isPaused || duration <= 0) return;

    const localStartTime = Date.now();
    const totalDuration = remainingTimeRef.current;
    const timer = setTimeout(handleDismiss, Math.max(0, totalDuration));

    const animate = () => {
      const elapsed = Date.now() - localStartTime;
      setProgress((Math.max(0, totalDuration - elapsed) / duration) * 100);
      if (elapsed < totalDuration) requestRef.current = requestAnimationFrame(animate);
    };
    if (typeof requestAnimationFrame === 'function') {
      requestRef.current = requestAnimationFrame(animate);
    }

    return () => {
      clearTimeout(timer);
      if (requestRef.current && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(requestRef.current);
      }
      remainingTimeRef.current = Math.max(0, totalDuration - (Date.now() - localStartTime));
    };
  }, [isVisible, isPaused, isRestored, isRestoring, duration, handleDismiss]);

  const positionClasses: Record<UndoToastPosition, string> = {
    'top-left': 'top-5 left-5 items-start',
    'top-center': 'top-5 left-1/2 -translate-x-1/2 items-center',
    'top-right': 'top-5 right-5 items-end',
    'bottom-left': 'bottom-5 left-5 items-start',
    'bottom-center': 'bottom-5 left-1/2 -translate-x-1/2 items-center',
    'bottom-right': 'bottom-5 right-5 items-end',
  };

  const getVariantIcon = () => {
    if (icon) return icon;
    switch (variant) {
      case 'success':
        return <CheckIcon className="w-4 h-4 text-[var(--success-500)]" />;
      case 'warning':
        return <ExclamationTriangleIcon className="w-4 h-4 text-[var(--warning-500)]" />;
      case 'error':
        return <ExclamationCircleIcon className="w-4 h-4 text-[var(--danger-500)]" />;
      case 'info':
        return <InformationCircleIcon className="w-4 h-4 text-[var(--brand-600)]" />;
      default:
        return <TrashIcon className="w-4 h-4 text-[var(--text-3)]" />;
    }
  };

  const fromTop = position.startsWith('top') && !stacked;
  const shownTitle = isRestored ? restoredMessage : title;

  const card = (
    <motion.div
      layout={!reduceMotion}
      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: fromTop ? -16 : 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: fromTop ? -10 : 10 }}
      transition={reduceMotion ? instant : springSnappy}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsFocused(true)}
      onBlur={(e) => {
        // Moving between the toast's own buttons is still "inside".
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsFocused(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          handleDismiss();
        }
      }}
      data-undo-toast=""
      data-paused={isPaused || isRestoring ? 'true' : 'false'}
      className={cn(
        'pointer-events-auto relative overflow-hidden rounded-xl border border-[var(--border-2)] bg-[var(--surface-0)] text-[var(--text-1)] shadow-[0_12px_32px_rgba(0,0,0,0.14)] dark:shadow-[0_12px_32px_rgba(0,0,0,0.6)] p-3.5 sm:p-4 min-w-[280px] sm:min-w-[340px] max-w-md font-sans select-none',
        className
      )}
      role="status"
      // Inside Foundry's ToastProvider the viewport is already the polite live region;
      // a second one nested in it would announce twice.
      aria-live={stacked ? undefined : 'polite'}
    >
      <div className="flex items-center justify-between gap-3 relative z-10">
        {/* Icon / Status indicator */}
        <div className="w-8 h-8 rounded-lg bg-[var(--surface-1)] border border-[var(--border-2)] flex items-center justify-center shrink-0">
          {isRestored ? (
            <motion.div
              initial={reduceMotion ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              transition={reduceMotion ? instant : springSnappy}
            >
              <CheckIcon className="w-4 h-4 text-[var(--success-500)]" />
            </motion.div>
          ) : (
            getVariantIcon()
          )}
        </div>

        {/* Text copy */}
        <div className="flex-1 min-w-0 pr-1">
          <p className="text-xs font-semibold text-[var(--text-1)] truncate" title={shownTitle}>
            {shownTitle}
          </p>
          {description && !isRestored && (
            <p className="text-[11px] text-[var(--text-3)] truncate mt-0.5" title={description}>
              {description}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {!isRestored && (
            <button
              type="button"
              onClick={() => void handleUndoClick()}
              disabled={isRestoring}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[var(--surface-1)] hover:bg-[var(--surface-0)] border border-[var(--border-2)] hover:border-[var(--border-1)] text-xs font-medium text-[var(--text-1)] transition-colors cursor-pointer disabled:cursor-wait disabled:opacity-70"
            >
              <ArrowUturnLeftIcon className="w-3 h-3 text-[var(--text-3)]" />
              <span>{undoLabel}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 rounded-md text-[var(--text-4)] hover:text-[var(--text-1)] hover:bg-[var(--surface-1)] transition-colors cursor-pointer"
            aria-label="Close notification"
          >
            <XMarkIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Live Progress Bar countdown indicator — visual only; hidden under reduced motion. */}
      {showProgress && !isRestored && !reduceMotion && (
        <div aria-hidden="true" data-undo-progress="" className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--surface-2)]">
          <div
            className="h-full bg-[var(--text-1)] transition-all"
            style={{ width: `${progress}%`, transition: isPaused ? 'none' : 'width 50ms linear' }}
          />
        </div>
      )}
    </motion.div>
  );

  // Stacked: the parent removes the card on `onDismiss` and its AnimatePresence plays the
  // exit, so the card must still be rendered when that happens.
  if (stacked) return card;

  return (
    <div
      className={cn(
        'fixed z-50 pointer-events-none flex flex-col',
        positionClasses[position]
      )}
    >
      <AnimatePresence>{isVisible && card}</AnimatePresence>
    </div>
  );
};
