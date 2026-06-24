// Third-party grade parity — map the checks we already run to the A+…F letter
// grades people trust from securityheaders.com / Mozilla Observatory / SSL Labs,
// so Pulse benchmarks against tools clients already recognise. Deterministic,
// AI-free, computed on read from scan.checks (no persistence) — like effectiveTechStack.

import type { PulseScanCheckInput, PulseScanCheckRecord } from "@/types/pulse";

export type LetterGrade = "A+" | "A" | "B" | "C" | "D" | "F" | "—";

export interface PulseGrade {
  key: string;
  label: string;
  grade: LetterGrade;
  score: number;        // 0–100 (the pass ratio it's derived from)
  basis: string;        // short human explanation
}

type AnyCheck = PulseScanCheckInput | PulseScanCheckRecord;

function letter(pct: number): LetterGrade {
  if (pct >= 95) return "A+";
  if (pct >= 85) return "A";
  if (pct >= 75) return "B";
  if (pct >= 65) return "C";
  if (pct >= 50) return "D";
  return "F";
}

/** Pass-ratio (0–100) over a set of check keys that actually ran (not SKIPPED). */
function passRatio(checks: AnyCheck[], keys: Set<string>): { pct: number; applicable: number; passed: number } {
  const relevant = checks.filter((c) => keys.has(c.checkKey) && c.status !== "SKIPPED");
  const passed = relevant.filter((c) => c.status === "PASS").length;
  return { pct: relevant.length === 0 ? 0 : Math.round((passed / relevant.length) * 100), applicable: relevant.length, passed };
}

const SECURITY_HEADER_KEYS = new Set([
  "csp_header", "hsts_header", "x_frame_options", "referrer_policy", "permissions_policy",
  "content_security_policy_nonce", "csp_frame_ancestors", "csp_report_directive",
  "cross_origin_opener_policy", "cross_origin_resource_policy", "cross_origin_embedder_policy",
]);

const TLS_KEYS = new Set(["ssl_valid", "hsts_header", "certificate_expiry_30d"]);

/** Letter grades mirroring the tools clients trust. Each is null/"—" if nothing ran. */
export function computeGrades(checks: AnyCheck[]): PulseGrade[] {
  const grades: PulseGrade[] = [];

  const sec = passRatio(checks, SECURITY_HEADER_KEYS);
  if (sec.applicable > 0) {
    grades.push({ key: "security_headers", label: "Security headers", grade: letter(sec.pct), score: sec.pct,
      basis: `${sec.passed}/${sec.applicable} security headers present (Mozilla Observatory style)` });
  }

  // TLS posture — ssl_valid is the hard gate (no HTTPS ⇒ F regardless of the rest).
  const tls = passRatio(checks, TLS_KEYS);
  if (tls.applicable > 0) {
    const noSsl = checks.some((c) => c.checkKey === "ssl_valid" && c.status === "FAIL");
    grades.push({ key: "tls_posture", label: "TLS posture", grade: noSsl ? "F" : letter(tls.pct), score: noSsl ? 0 : tls.pct,
      basis: noSsl ? "HTTPS not working" : `HTTPS + HSTS + certificate health (${tls.passed}/${tls.applicable})` });
  }

  const a11yChecks = checks.filter((c) => c.category === "Accessibility" && c.status !== "SKIPPED");
  if (a11yChecks.length > 0) {
    const passed = a11yChecks.filter((c) => c.status === "PASS").length;
    const pct = Math.round((passed / a11yChecks.length) * 100);
    grades.push({ key: "accessibility", label: "Accessibility", grade: letter(pct), score: pct,
      basis: `${passed}/${a11yChecks.length} WCAG checks passed` });
  }

  return grades;
}
