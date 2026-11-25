/**
 * The standup preview, grouped exactly as the server posts it (src/server/tasks-standup.ts).
 * Pure so the composer and its tests agree with the post.
 */
import type { TaskDTO } from "@/types/tasks";

/** One heading in the standup preview. */
export interface PreviewGroup {
  label: string;
  tasks: TaskDTO[];
}

/**
 * What the post will carry, grouped exactly as the server posts it (tasks-standup.ts): AM is
 * in progress then in review; PM is done today, in review, then still in progress. The preview
 * used to show only the done list for PM, so a developer on a multi-day task saw "nothing to
 * send" and couldn't pick that client, although the post would have included the work.
 */
export function standupPreviewGroups(
  phase: "AM" | "PM" | null,
  data: { doing: TaskDTO[]; done: TaskDTO[] },
): PreviewGroup[] {
  if (!phase) return [];
  const inReview = data.doing.filter((t) => t.status === "IN_REVIEW" || t.status === "UI_DONE");
  const active = data.doing.filter((t) => t.status !== "IN_REVIEW" && t.status !== "UI_DONE");
  return phase === "AM"
    ? [
        { label: "In progress", tasks: active },
        { label: "In review", tasks: inReview },
      ]
    : [
        { label: "Done today", tasks: data.done },
        { label: "In review", tasks: inReview },
        { label: "Still in progress", tasks: active },
      ];
}

