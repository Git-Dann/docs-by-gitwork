import type { Metadata } from "next";

// Chrome-free layout for the brand guidelines. No AppShell: the guidelines carry their own
// sidebar and top bar. Forced light (FORCE_LIGHT in the theme provider) because it is a
// printed brand book, and paper is its ground.
export const metadata: Metadata = {
  title: "Brand guidelines",
  robots: { index: false, follow: false },
};

export default function GuidelinesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
