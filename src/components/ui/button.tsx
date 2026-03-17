"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/format";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "link"
  | "hyperlink"
  | "danger"
  | "utility";
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon-sm" | "icon-md";

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "border-transparent bg-[var(--brand-600)] text-white shadow-[0_1px_0_rgba(15,23,42,0.08)] hover:bg-[var(--brand-700)] active:bg-[var(--brand-700)]",
  secondary:
    "border-[var(--border-1)] bg-white text-[var(--text-2)] hover:bg-[var(--surface-1)] active:bg-[var(--surface-1)]",
  tertiary:
    "border-transparent bg-transparent text-[var(--text-2)] hover:bg-[var(--surface-1)] active:bg-[var(--surface-1)]",
  link:
    "border-transparent bg-transparent px-0 text-[var(--brand-700)] underline-offset-2 hover:underline",
  hyperlink:
    "border-transparent bg-transparent px-0 text-[var(--brand-700)] underline-offset-2 hover:underline",
  danger:
    "border-rose-200 bg-white text-rose-700 hover:bg-rose-50 active:bg-rose-50",
  utility:
    "border-[var(--border-1)] bg-white text-[var(--text-3)] hover:border-[var(--brand-500)] hover:text-[var(--brand-700)]",
};

const sizeStyles: Record<ButtonSize, string> = {
  xs: "h-[42px] rounded-xl px-3 text-sm font-medium",
  sm: "h-[42px] rounded-xl px-3.5 text-sm font-medium",
  md: "h-[42px] rounded-xl px-4 text-sm font-medium",
  lg: "h-11 rounded-xl px-4 text-base font-medium",
  "icon-sm": "h-10 w-10 rounded-xl p-0",
  "icon-md": "h-[42px] w-[42px] rounded-xl p-0",
};

export function buttonStyles({
  variant = "secondary",
  size = "sm",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap border text-center leading-none transition outline-none [&_svg]:shrink-0",
    "focus-visible:ring-2 focus-visible:ring-[var(--brand-500)] focus-visible:ring-offset-1 focus-visible:ring-offset-white",
    "disabled:pointer-events-none disabled:opacity-45",
    variantStyles[variant],
    sizeStyles[size],
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    className,
    variant = "secondary",
    size = "sm",
    loading = false,
    leadingIcon,
    trailingIcon,
    disabled,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      className={buttonStyles({ variant, size, className })}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
      ) : (
        leadingIcon
      )}
      {children}
      {trailingIcon}
    </button>
  );
});
