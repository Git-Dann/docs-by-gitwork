"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { buttonStyles } from "./button-styles";
import type { ButtonVariant, ButtonSize } from "./button-styles";
import { Spinner } from "@/components/ui/motion/spinner";
export type { ButtonVariant, ButtonSize } from "./button-styles";
export { buttonStyles } from "./button-styles";

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
        <Spinner size="sm" />
      ) : (
        leadingIcon
      )}
      {children}
      {trailingIcon}
    </button>
  );
});
