import type { Metadata } from "next";
import { MarketingProductsPage } from "@/components/marketing/site";

export const metadata: Metadata = {
  title: "Products | Gitwork",
  description:
    "Explore Docs, Proof, and CodeClear — Gitwork products for structured briefs, sharper proposals, and stronger hiring signal.",
};

export default function ProductsPage() {
  return <MarketingProductsPage />;
}
