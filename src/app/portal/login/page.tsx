import type { Metadata } from "next";
import { PortalLoginForm } from "@/components/portal/portal-login-form";

export const metadata: Metadata = {
  title: "Client Portal — Sign in",
  robots: { index: false },
};

export default async function PortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Only accept internal wiki paths as a post-login destination.
  const safeNext = next && next.startsWith("/wiki/") ? next : null;
  return <PortalLoginForm next={safeNext} />;
}
