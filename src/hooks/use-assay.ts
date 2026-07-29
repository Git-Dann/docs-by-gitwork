"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

// Client-facing DTOs — redeclared here rather than imported from src/server/assay/types so
// client components never pull in a server-only module. Same convention as use-foreman.ts
// and use-curator.ts.

export type ClauseVerdict = "MET" | "QUALIFIED" | "FAILED" | "UNPROVEN" | "NOT_APPLICABLE";
export type HallmarkGrade = "CERTIFIED" | "CONDITIONAL" | "NOT_CERTIFIED" | "INCOMPLETE";
export type HallmarkStatus = "VALID" | "EXPIRING" | "LAPSED" | "REVOKED" | "SUPERSEDED";

export interface ClauseOutcome {
  clauseId: string;
  title: string;
  assertion: string;
  critical: boolean;
  verdict: ClauseVerdict;
  rationale: string;
  confidence: "HIGH" | "MEDIUM" | "LOW" | null;
  evidenceKeys: string[];
  missingKeys: string[];
}

export interface AssayBlindSpot {
  kind: string;
  statement: string;
  clauseIds: string[];
}

export interface Hallmark {
  id: string;
  clientId: string | null;
  clientName: string | null;
  subjectName: string;
  subjectRepo: string | null;
  subjectCommit: string | null;
  subjectUrl: string | null;
  scanId: string;
  scanVersion: string;
  checkCount: number;
  standardId: string;
  standardVersion: string;
  grade: HallmarkGrade;
  gradeReason: string;
  clauses: ClauseOutcome[];
  blindSpots: AssayBlindSpot[];
  coverage: { measured: number; unmeasured: number; total: number; pct: number };
  issuerName: string;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
  supersededById: string | null;
  digest: string;
  seal: string | null;
  token: string;
  status: HallmarkStatus;
  daysRemaining: number;
}

interface HallmarkListResponse {
  hallmarks: Hallmark[];
  sealingConfigured: boolean;
}

const KEY = ["assay", "hallmarks"];

export function useHallmarks(enabled = true) {
  return useQuery<HallmarkListResponse>({
    queryKey: KEY,
    queryFn: () => apiFetch<HallmarkListResponse>("/api/assay/hallmarks"),
    enabled,
  });
}

export function useIssueHallmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { scanId: string; standardId?: string }) =>
      apiFetch<{ hallmark: Hallmark }>("/api/assay/hallmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useRevokeHallmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiFetch<{ hallmark: Hallmark }>(`/api/assay/hallmarks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
