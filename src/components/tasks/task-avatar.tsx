import { cn } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import type { TaskUserRef } from "@/types/tasks";

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
  // Shared primitive: falls back to initials if the image fails to load.
  return <Avatar src={user.avatarUrl} name={user.name} size={size} className={className} />;
}

/** Overlapping avatars for multi-assignee, with a +N overflow chip. */
export function AssigneeStack({
  users,
  size = 22,
  max = 3,
}: {
  users: TaskUserRef[];
  size?: number;
  max?: number;
}) {
  if (users.length === 0) return <TaskAvatar user={null} size={size} />;
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;
  return (
    <span className="inline-flex items-center">
      {shown.map((u, i) => (
        <span
          key={u.id}
          className="rounded-full ring-2 ring-white"
          style={{ marginLeft: i === 0 ? 0 : -size * 0.3, zIndex: max - i }}
        >
          <TaskAvatar user={u} size={size} />
        </span>
      ))}
      {extra > 0 ? (
        <span className="ml-1 text-[10px] font-medium text-[var(--text-4)]">+{extra}</span>
      ) : null}
    </span>
  );
}
