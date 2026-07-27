import { redirect } from "next/navigation";

// The public front door is the client portal login. Staff Google sign-in still
// lives at /login (reachable directly, e.g. from the portal login page).
//
// A platform landing page briefly lived here (July 2026) to win the ~49 SEO/AEO/Trust
// checks that parse "/"'s HTML — a Pulse scan follows this redirect, so it grades
// whatever "/" lands on. Dan's call was to keep the portal login as the front door,
// so the landing page is gone and what scan value could move without it went onto
// /portal/login instead: real landmarks, Organization/WebSite JSON-LD, and the
// company/VAT disclosure. See src/app/portal/login/page.tsx.
//
// Legal lives on gitwork.co.uk. The login footer links /privacy and /terms as RELATIVE
// paths that 308 out to it (next.config.ts) — the relative href is what satisfies the
// score-cap checks, the redirect is what serves the content. See portal-footer.tsx.
export default function RootPage() {
  redirect("/portal/login");
}
