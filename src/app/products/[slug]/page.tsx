import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingProductDetailPage, productSlugs } from "@/components/marketing/site";
import { getProduct } from "@/components/marketing/site-content";

export function generateStaticParams() {
  return productSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = getProduct(slug);

  if (!product) {
    return {
      title: "Product | Gitwork",
    };
  }

  return {
    title: `${product.name} | Gitwork`,
    description: product.summary,
  };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  if (!getProduct(slug)) {
    notFound();
  }

  return <MarketingProductDetailPage slug={slug} />;
}
