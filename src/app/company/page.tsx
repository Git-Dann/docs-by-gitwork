import type { Metadata } from "next";
import { MarketingCompanyPage } from "@/components/marketing/site";

export const metadata: Metadata = {
  title: "Company | Gitwork",
  description:
    "Learn how Gitwork combines embedded developers, UK-led delivery, and product-minded operating systems.",
};

export default function CompanyPage() {
  return <MarketingCompanyPage />;
}
