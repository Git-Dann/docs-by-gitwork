import { cn } from "@/lib/format";
import type { TaskUserRef } from "@/types/tasks";

function initials(name: string): string {
  return (
    name
      .split(" ")
      .map((w) => w[0] ?? "")
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

/** Small assignee avatar — uploaded image if present, else initials. */
export function TaskAvatar({
  user,
  size = 24,
  className,
}: {
  user: TaskUserRef | null;
  size?: number;
  className?: string;
}) {
  if (!user) {
    return (
      <span
        title="Unassigned"
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--border-2)] text-[var(--text-4)]",
          className,
        )}
        style={{ width: size, height: size, fontSize: size * 0.42 }}
      >
        ?
      </span>
    );
  }
  if (user.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatarUrl}
        alt={user.name}
        title={user.name}
        className={cn("shrink-0 rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      title={user.name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--surface-brand)] font-semibold text-[var(--brand-700)]",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials(user.name)}
    </span>
  );
}
