/**
 * DevSignal score calibration — the "flywheel". This is the piece that turns a
 * cold-start guess into a validated instrument.
 *
 * METHOD (criterion-related validation — the standard in personnel selection):
 * we treat each pipeline stage's score as a PREDICTOR and a real delivery
 * outcome as the CRITERION, and correlate them (Pearson r) across assessments
 * that have a recorded outcome. The composite score's correlation with the
 * outcome is its "operational validity". Weights can then be re-derived from the
 * data instead of guessed.
 *
 * GROUNDING (so the model is defensible to an academic reviewer):
 *  - Schmidt & Hunter (1998) — 85-year meta-analysis of selection-method
 *    validity (the classic reference; GMA r≈.51).
 *  - Sackett, Zhang, Berry & Lievens (2022), "Revisiting meta-analytic estimates
 *    of validity in personnel selection" (J. Applied Psych.) — corrected for
 *    systematic range-restriction over-correction; REVISED operational validity:
 *    structured interview r≈.42, job-knowledge r≈.40, work-sample r≈.33.
 *    These are our BENCHMARKS below: DevSignal's stages map onto those method
 *    families, so we can compare our observed local validity to the literature.
 *  - Criterion-related validation guidelines (SIOP Principles): local studies
 *    need adequate N; small samples give unstable coefficients (we gate the
 *    "calibrated" state on N and surface the caveats rather than over-claim).
 *
 * HONESTY CAVEATS (surfaced in the UI, never hidden):
 *  - Range restriction: we only observe outcomes for candidates who PASSED the
 *    gate and were placed, so observed r UNDERSTATES true validity.
 *  - Criterion unreliability: a 1–5 client rating is a noisy criterion.
 *  - Small N: coefficients below the sample thresholds are indicative, not
 *    conclusive.
 *
 * This module is pure (no IO, no framework) so the server computes with it and
 * the client renders the benchmark constants, and it is fully unit-testable.
 */

/** Revised operational validity benchmarks (Sackett et al. 2022) by method. */
export const VALIDITY_BENCHMARKS: Record<string, { method: string; r: number; source: string }> = {
  coding_challenge: { method: "Work-sample test", r: 0.33, source: "Sackett et al. 2022" },
  leadership_interview: { method: "Structured interview", r: 0.42, source: "Sackett et al. 2022" },
  online_footprint: { method: "Job-knowledge / work evidence", r: 0.4, source: "Sackett et al. 2022" },
  video_assessment: { method: "Structured interview (comms)", r: 0.42, source: "Sackett et al. 2022" },
  profile_connections: { method: "Biographical data", r: 0.38, source: "Sackett et al. 2022" },
  application_intake: { method: "Application data", r: 0.1, source: "—" },
  identity_verification: { method: "Trust gate (not predictive)", r: 0, source: "—" },
};

/** Sample-size gates for the model's confidence state (SIOP-style guidance). */
export const CALIBRATION_THRESHOLDS = {
  /** Below this, we won't report correlations at all. */
  minForCorrelation: 3,
  /** Below this, the model is "provisional" (indicative only). */
  provisional: 10,
  /** At/above this, the model is "calibrated" (local validity established). */
  calibrated: 30,
} as const;

export type CalibrationStatus = "insufficient" | "provisional" | "calibrated";

export interface OutcomeSignals {
  retained?: boolean | null;
  tenureDays?: number | null;
  clientRating?: number | null;
  churned?: boolean | null;
}

/**
 * Collapse the recorded outcome signals into a single 0–100 criterion.
 * Priority: client rating (strongest) > churn/retention > tenure. Returns null
 * when no signal was recorded (that link doesn't feed calibration).
 */
export function deriveCriterion(o: OutcomeSignals): number | null {
  if (typeof o.clientRating === "number" && o.clientRating >= 1 && o.clientRating <= 5) {
    return Math.round(((o.clientRating - 1) / 4) * 100);
  }
  if (o.churned === true) return 15;
  if (o.retained === true) return 80;
  if (typeof o.tenureDays === "number" && o.tenureDays > 0) {
    // Tenure alone is a weak proxy — cap at one year → 100.
    return Math.min(100, Math.round((o.tenureDays / 365) * 100));
  }
  return null;
}

/** Pearson correlation. Returns null for n<3 or zero variance in either series. */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < CALIBRATION_THRESHOLDS.minForCorrelation) return null;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
    sxx += xs[i] * xs[i];
    syy += ys[i] * ys[i];
    sxy += xs[i] * ys[i];
  }
  const cov = n * sxy - sx * sy;
  const dx = n * sxx - sx * sx;
  const dy = n * syy - sy * sy;
  if (dx <= 0 || dy <= 0) return null;
  const r = cov / Math.sqrt(dx * dy);
  if (!Number.isFinite(r)) return null;
  return Math.max(-1, Math.min(1, Math.round(r * 1000) / 1000));
}

export interface CalibrationSample {
  finalScore: number;
  /** stageId → that stage's raw 0–100 score for this assessment. */
  stageScores: Record<string, number>;
  criterion: number;
}

export interface StageValidity {
  stageId: string;
  n: number;
  /** Observed local validity (Pearson r) — null if too few points / no variance. */
  r: number | null;
  benchmark: number | null;
  benchmarkMethod: string | null;
}

export interface CalibrationReport {
  status: CalibrationStatus;
  /** Assessments with both a score and a recorded outcome. */
  n: number;
  /** Operational validity of the composite score (r vs criterion). */
  overallValidity: number | null;
  stages: StageValidity[];
  /** Advisory reweighting derived from the data (never auto-applied). Null when insufficient. */
  suggestedWeights: Record<string, number> | null;
  caveats: string[];
}

function statusForN(n: number): CalibrationStatus {
  if (n >= CALIBRATION_THRESHOLDS.calibrated) return "calibrated";
  if (n >= CALIBRATION_THRESHOLDS.provisional) return "provisional";
  return "insufficient";
}

/**
 * Compute the calibration report from the recorded samples. `predictiveStages`
 * is the set of stages the current config actually scores (enabled, weight > 0)
 * — only those are correlated + reweighted; the trust-gate + aggregation stages
 * are left out of the suggestion.
 */
export function computeCalibration(
  samples: CalibrationSample[],
  predictiveStages: string[],
): CalibrationReport {
  const n = samples.length;
  const status = statusForN(n);

  const overallValidity = pearson(
    samples.map((s) => s.finalScore),
    samples.map((s) => s.criterion),
  );

  const stages: StageValidity[] = predictiveStages.map((stageId) => {
    const pairs = samples
      .map((s) => [s.stageScores[stageId], s.criterion] as const)
      .filter(([x]) => typeof x === "number" && Number.isFinite(x));
    const bm = VALIDITY_BENCHMARKS[stageId];
    return {
      stageId,
      n: pairs.length,
      r: pearson(pairs.map((p) => p[0]), pairs.map((p) => p[1])),
      benchmark: bm?.r ?? null,
      benchmarkMethod: bm?.method ?? null,
    };
  });

  // Suggested weights: proportional to each stage's positive observed validity,
  // normalised to sum 100. Only computed once we have enough data to trust it.
  let suggestedWeights: Record<string, number> | null = null;
  if (status !== "insufficient") {
    const positives = stages.map((s) => ({ id: s.stageId, w: Math.max(0, s.r ?? 0) }));
    const total = positives.reduce((sum, p) => sum + p.w, 0);
    if (total > 0) {
      suggestedWeights = {};
      let allocated = 0;
      positives.forEach((p, i) => {
        const raw = (p.w / total) * 100;
        // Round, giving the remainder to the last stage so the sum is exactly 100.
        const weight = i === positives.length - 1 ? 100 - allocated : Math.round(raw);
        suggestedWeights![p.id] = Math.max(0, weight);
        allocated += suggestedWeights![p.id];
      });
    }
  }

  const caveats: string[] = [];
  if (status === "insufficient") {
    caveats.push(
      `Only ${n} scored outcome${n === 1 ? "" : "s"} recorded — need ${CALIBRATION_THRESHOLDS.provisional}+ for an indicative read, ${CALIBRATION_THRESHOLDS.calibrated}+ to calibrate.`,
    );
  } else if (status === "provisional") {
    caveats.push(
      `${n} outcomes — indicative only; coefficients are unstable below ${CALIBRATION_THRESHOLDS.calibrated}.`,
    );
  }
  caveats.push(
    "Range restriction: only placed candidates have outcomes, so observed validity understates the true figure (Sackett et al. 2022).",
  );
  caveats.push("Client rating is a noisy criterion — treat single-point differences with caution.");

  return { status, n, overallValidity, stages, suggestedWeights, caveats };
}
