import type { Metadata } from "next";
import { MarketingCustomersPage } from "@/components/marketing/site";

export const metadata: Metadata = {
  title: "Customers | Gitwork",
  description:
    "Read Gitwork customer stories across embedded delivery, platform builds, and technical capacity support.",
};

export default function CustomersPage() {
  return <MarketingCustomersPage />;
}
