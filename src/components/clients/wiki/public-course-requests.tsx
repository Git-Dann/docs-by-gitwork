"use client";

/**
 * Course requests on the client's share page, loaded when the section opens (the wiki carries only
 * counts, CLAUDE.md §140). Changing many at once is one request, not one per row.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, type CourseRequestRecord } from "@/lib/api";
import { LoadingState } from "@/components/ui/motion/loading-state";
import { CourseRequestsSection } from "./course-requests-section";

export function PublicCourseRequests({ token }: { token: string }) {
  const url = `/api/wiki/${encodeURIComponent(token)}/course-requests`;
  const key = ["public-wiki", token, "course-requests"];
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: key, queryFn: () => apiFetch<CourseRequestRecord[]>(url), staleTime: 30_000 });
  const write = useMutation({
    mutationFn: ({ method, ids, status }: { method: "PATCH" | "DELETE"; ids: string[]; status?: string }) =>
      apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, status }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  if (list.isPending) return <LoadingState label="Loading course requests" />;
  if (list.isError) {
    return (
      <p role="alert" className="text-[13px] text-[var(--danger-500)]">
        {list.error instanceof Error ? list.error.message : "Couldn't load the course requests"}
      </p>
    );
  }
  return (
    <CourseRequestsSection
      requests={list.data}
      onDelete={async (ids) => {
        await write.mutateAsync({ method: "DELETE", ids });
      }}
      onSetStatus={async (ids, status) => {
        await write.mutateAsync({ method: "PATCH", ids, status });
      }}
    />
  );
}
