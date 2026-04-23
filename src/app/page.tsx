import type { Metadata } from "next";
import { MarketingHomePage } from "@/components/marketing/site";

export const metadata: Metadata = {
  title: "Gitwork | Delivery-ready product teams",
  description:
    "Gitwork combines embedded developers, UK-led delivery, and a sharper platform for briefs, proposals, and hiring signal.",
};

export default function HomePage() {
  return <MarketingHomePage />;
}
