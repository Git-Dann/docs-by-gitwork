// Foundry's public origin as seen by the client, derived from the incoming
// request's Host header — NOT from `request.url`.
//
// Next.js's self-hosted STANDALONE build (this app's Docker image, §23)
// hardcodes `experimental.trustHostHeader` to the Vercel-platform-detection
// boolean when it writes required-server-files.json
// (next/dist/build/index.js, the "generate-required-server-files" step),
// unconditionally overwriting whatever's set in next.config.ts. The result:
// every Route Handler's `request.url` is built from the server's own bind
// hostname/port (HOSTNAME=0.0.0.0, PORT=3000), never from the real Host
// header — regardless of config, and regardless of what nginx forwards.
// Confirmed by instrumenting Next's own config.js/build/index.js directly;
// this isn't a guess and there's no next.config.ts setting that fixes it.
//
// Any route that needs an absolute URL (OAuth issuer/redirects, resource
// metadata, etc.) must derive it from this helper instead of
// `new URL(request.url).origin` / `.host` / `.protocol`. nginx already
// forwards the real Host header correctly (`proxy_set_header Host $host`),
// so reading it directly sidesteps the broken request.url path entirely.
export function originFrom(request: Request): string {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    new URL(request.url).host;
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
    new URL(request.url).protocol.replace(":", "");
  return `${proto}://${host}`;
}
