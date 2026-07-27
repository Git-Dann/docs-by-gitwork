import { redirect } from "next/navigation";

// The public front door is the client portal login. Staff Google sign-in still
// lives at /login (reachable directly, e.g. from the portal login page).
//
// A platform landing page briefly lived here (July 2026) to win the ~49 SEO/AEO/Trust
// checks that parse "/"'s HTML — a Pulse scan follows this redirect, so it grades
// whatever "/" lands on. Dan's call was to keep the portal login as the front door,
// so the landing page is gone and the scan-critical scaffolding moved onto
// /portal/login instead: the legal footer carrying the exact href="/privacy" and
// href="/terms" links that lift the score cap, real landmarks, and the company/VAT
// disclosure. See src/app/portal/login/page.tsx.
export default function RootPage() {
  redirect("/portal/login");
}
