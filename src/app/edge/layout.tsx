import type { Metadata } from "next";

// Chrome-free layout for the Corsair Xeneon Edge exec board. No AppShell (no sidebar,
// no top bar) — the board owns the whole viewport. The route is forced dark by the
// theme provider + anti-flash script (see FORCE_DARK).
export const metadata: Metadata = {
  title: "Mission Control · Foundry",
  robots: { index: false, follow: false },
};

export default function EdgeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
