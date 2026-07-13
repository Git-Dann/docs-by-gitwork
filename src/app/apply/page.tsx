import type { Metadata } from "next";
import { ApplyFlow } from "./apply-flow";

const TITLE = "DevSignal — prove your calibre | Gitwork";
const DESCRIPTION =
  "A short, fair developer assessment from Gitwork. Show how you actually work — GitHub, a real coding task, a quick intro — and get matched to real client projects.";

// Smart social preview so the shared link unfurls nicely (Slack/LinkedIn/X).
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: false, follow: false },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: "Gitwork",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const dynamic = "force-dynamic";

export default function ApplyPage() {
  return <ApplyFlow />;
}
