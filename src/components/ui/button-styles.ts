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
    variant === "primary" ? "text-white hover:text-white visited:text-white" : null,
    className,
  );
}
