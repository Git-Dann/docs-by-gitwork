/**
 * The three example Pulse reports linked from /pulse/features. One list, read by the
 * overview cards, the example report page and its PDF route, so they cannot disagree.
 * The scans themselves are the sales-demo fixtures (src/lib/demo/dev-demo-data.ts).
 */

export interface ExampleReport {
  id: "strong" | "middling" | "weak";
  /** What the card calls it. */
  label: string;
  subject: string;
  kind: string;
  /** Must equal the demo scan's healthScore; a test holds them together. */
  score: number;
  summary: string;
}

export const EXAMPLE_REPORTS: ExampleReport[] = [
  {
    id: "strong",
    label: "Strong",
    subject: "northwind.example",
    kind: "SaaS web app",
    score: 86,
    summary: "Sound security and a working release process. A handful of warnings to clear.",
  },
  {
    id: "middling",
    label: "Middling",
    subject: "example/cadenza",
    kind: "GitHub repo",
    score: 63,
    summary: "Works, but failures are invisible in production and the code carries real debt.",
  },
  {
    id: "weak",
    label: "Weak",
    subject: "fairwaynine.example",
    kind: "Marketing site",
    score: 48,
    summary: "Out-of-date platform, no security headers and a slow, inaccessible front page.",
  },
];

export function exampleReport(id: string): ExampleReport | null {
  return EXAMPLE_REPORTS.find((r) => r.id === id) ?? null;
}
