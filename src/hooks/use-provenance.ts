"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

// Client-facing DTOs — redeclared here rather than imported from src/server/provenance/types so
// client components never pull in a server-only module. Same convention as use-foreman.ts
// and use-curator.ts.

export type ClauseVerdict = "MET" | "QUALIFIED" | "FAILED" | "UNPROVEN" | "NOT_APPLICABLE";
export type CountermarkGrade = "CERTIFIED" | "CONDITIONAL" | "NOT_CERTIFIED" | "INCOMPLETE";
export type CountermarkStatus = "VALID" | "EXPIRING" | "LAPSED" | "REVOKED" | "SUPERSEDED";

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

export interface ProvenanceBlindSpot {
  kind: string;
  statement: string;
  clauseIds: string[];
}

export interface Countermark {
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
  grade: CountermarkGrade;
  gradeReason: string;
  clauses: ClauseOutcome[];
  blindSpots: ProvenanceBlindSpot[];
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
  status: CountermarkStatus;
  daysRemaining: number;
}

interface CountermarkListResponse {
  countermarks: Countermark[];
  sealingConfigured: boolean;
}

const KEY = ["provenance", "countermarks"];

export function useCountermarks(enabled = true) {
  return useQuery<CountermarkListResponse>({
    queryKey: KEY,
    queryFn: () => apiFetch<CountermarkListResponse>("/api/provenance/countermarks"),
    enabled,
  });
}

export function useIssueCountermark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { scanId: string; standardId?: string }) =>
      apiFetch<{ countermark: Countermark }>("/api/provenance/countermarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useRevokeCountermark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiFetch<{ countermark: Countermark }>(`/api/provenance/countermarks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

/**
 * Seed the six specimen countermarks (Super Admin only).
 *
 * Uses the session cookie — no API key. The route's own gate is
 * `assertSuperAdminOrApiKey`, and middleware accepts a valid NextAuth session as
 * authorization for /api/*, so a signed-in Super Admin can call it straight from the UI.
 */
export function useSeedProvenanceDemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{
        ok: boolean;
        seeded: number;
        standard: string;
        gradeMismatches: string[];
        note: string;
      }>("/api/dev/seed-provenance-demo", { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
