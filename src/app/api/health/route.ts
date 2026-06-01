import { apiOk } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);

  // TEMP DIAGNOSTIC: /api/health?check=auth — surfaces the real cause behind the
  // masked next-auth "Configuration" sign-in error. Remove once login is fixed.
  if (url.searchParams.get("check") === "auth") {
    const out: Record<string, unknown> = {
      node: process.version,
      env: {
        AUTH_GOOGLE_ID_len: (process.env.AUTH_GOOGLE_ID ?? "").length,
        AUTH_GOOGLE_ID_clean: (process.env.AUTH_GOOGLE_ID ?? "") === (process.env.AUTH_GOOGLE_ID ?? "").trim(),
        AUTH_GOOGLE_SECRET_len: (process.env.AUTH_GOOGLE_SECRET ?? "").length,
        AUTH_GOOGLE_SECRET_clean: (process.env.AUTH_GOOGLE_SECRET ?? "") === (process.env.AUTH_GOOGLE_SECRET ?? "").trim(),
        AUTH_SECRET_len: (process.env.AUTH_SECRET ?? "").length,
        NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? null,
        AUTH_URL: process.env.AUTH_URL ?? null,
        AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST ?? null,
        VERCEL: process.env.VERCEL ?? null,
      },
    };

    // 1. Does Google OIDC discovery work from the function?
    try {
      const r = await fetch("https://accounts.google.com/.well-known/openid-configuration");
      const j = (await r.json()) as { authorization_endpoint?: string };
      out.discovery = { ok: r.ok, status: r.status, authorization_endpoint: j.authorization_endpoint };
    } catch (e) {
      const err = e as Error & { cause?: unknown };
      out.discovery = { error: err.message, cause: String(err.cause) };
    }

    // 2. Actually reproduce the failing signIn and capture the real error.
    try {
      const { signIn } = await import("@/auth");
      await signIn("google", { redirect: false });
      out.signIn = "no-throw";
    } catch (e) {
      const err = e as Error & { cause?: unknown; digest?: string };
      out.signIn = {
        name: err.name,
        message: err.message,
        digest: err.digest ?? null,
        cause: String(err.cause),
      };
    }

    return apiOk(out);
  }

  return apiOk({
    ok: true,
    service: "foundry-by-gitwork",
    version: process.env.npm_package_version ?? "0.1.0",
    timestamp: new Date().toISOString(),
  });
}
