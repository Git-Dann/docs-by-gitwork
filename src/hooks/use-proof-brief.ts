"use client";

import { useMutation } from "@tanstack/react-query";
import type { AnalyseBriefResponse } from "@/types/proof-brief";

async function analyseBrief(brief: string): Promise<AnalyseBriefResponse> {
  const res = await fetch("/api/proof/analyse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brief }),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const message = typeof data?.error === "string" ? data.error : `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return data as unknown as AnalyseBriefResponse;
}

export function useAnalyseBrief() {
  return useMutation({
    mutationFn: analyseBrief,
  });
}
