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
// The legal pages that would have lifted the score cap were removed before merge
// pending legal review, so privacy_policy / terms_of_service stay FAIL and the score
// remains capped at 65. See the note in components/public/portal-footer.tsx.
export default function RootPage() {
  redirect("/portal/login");
}
