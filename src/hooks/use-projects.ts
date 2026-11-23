"use client";

/** A client's projects (CLAUDE.md §150). Every key starts "client-projects" so task writes refresh them. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  archiveClientProject,
  createClientProject,
  getClientProject,
  getClientProjects,
  getMoneyProjects,
  updateClientProject,
  type ProjectBody,
} from "@/lib/api";

export const projectKeys = {
  list: (slug: string, documents = false) => ["client-projects", slug, documents ? "with-documents" : "list"] as const,
  one: (slug: string, id: string) => ["client-projects", slug, "one", id] as const,
  money: ["client-projects", "money"] as const,
};

export function useClientProjects(slug: string | null, opts: { documents?: boolean; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: projectKeys.list(slug ?? "", Boolean(opts.documents)),
    queryFn: () => getClientProjects(slug as string, { documents: opts.documents }),
    enabled: Boolean(slug) && opts.enabled !== false,
    staleTime: 30_000,
  });
}

export function useClientProject(slug: string, id: string | null) {
  return useQuery({
    queryKey: projectKeys.one(slug, id ?? ""),
    queryFn: () => getClientProject(slug, id as string),
    enabled: Boolean(id),
    staleTime: 15_000,
  });
}

export function useMoneyProjects() {
  return useQuery({ queryKey: projectKeys.money, queryFn: getMoneyProjects, staleTime: 5 * 60_000 });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["client-projects"] });
    // Releases and categories carry the project they belong to.
    void qc.invalidateQueries({ queryKey: ["tasks"] });
  };
}

export function useCreateProject(slug: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: ProjectBody & { name: string; startDate: string }) => createClientProject(slug, body),
    onSuccess: invalidate,
  });
}

export function useUpdateProject(slug: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ProjectBody }) => updateClientProject(slug, id, body),
    onSuccess: invalidate,
  });
}

export function useArchiveProject(slug: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => archiveClientProject(slug, id),
    onSuccess: invalidate,
  });
}
