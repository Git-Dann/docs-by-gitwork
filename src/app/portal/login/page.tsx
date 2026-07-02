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
  return (
    <>
      {/* Theme-lock the document itself to the cream so iOS Safari's overscroll /
          address-bar area matches the login (the app body is otherwise dark in
          OS dark mode, which showed as a "cropped" background). */}
      <style>{`html,body{background:#EDE8E1 !important;color-scheme:light;}`}</style>
      <PortalLoginForm next={safeNext} />
    </>
  );
}
