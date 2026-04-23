import type { Metadata } from "next";
import { MarketingPricingPage } from "@/components/marketing/site";

export const metadata: Metadata = {
  title: "Pricing | Gitwork",
  description:
    "See Gitwork pricing for daily support, monthly retainers, and custom enterprise delivery.",
};

export default function PricingPage() {
  return <MarketingPricingPage />;
}
