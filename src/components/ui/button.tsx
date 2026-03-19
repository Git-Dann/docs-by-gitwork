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
  primary: "app-button-primary",
  secondary: "app-button-secondary",
  tertiary: "app-button-tertiary",
  link: "app-button-link",
  hyperlink: "app-button-hyperlink",
  danger: "app-button-danger",
  utility: "app-button-utility",
};

const sizeStyles: Record<ButtonSize, string> = {
  xs: "app-button-xs",
  sm: "app-button-sm",
  md: "app-button-md",
  lg: "app-button-lg",
  "icon-sm": "app-button-icon-sm",
  "icon-md": "app-button-icon-md",
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
  const isTextButton = variant === "link" || variant === "hyperlink";

  return cn(
    "app-button shrink-0 [&_svg]:shrink-0",
    variantStyles[variant],
    isTextButton ? null : sizeStyles[size],
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
