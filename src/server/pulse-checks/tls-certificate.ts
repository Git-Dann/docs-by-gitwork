/**
 * Read the certificate a host actually presents, and judge how long it has left.
 *
 * `certificate_expiry_30d` used to be derived from the HSTS max-age header, which has
 * nothing to do with certificate expiry — a certificate expiring tomorrow PASSed. This
 * reads the leaf certificate over TLS (`getPeerCertificate().valid_to`) instead.
 *
 * `rejectUnauthorized: false` is deliberate: an expired or mis-issued certificate must
 * still be READ so it can be reported. Nothing is sent over the connection.
 */
import type { PulseScanCheckInput } from "@/types/pulse";
import { CATEGORIES } from "./categories";
import { assertPublicHost } from "@/server/pulse-lite/url-guard";

export type CertificateReading =
  | { ok: true; validTo: Date; issuer: string | null; authorized: boolean; authorizationError: string | null }
  | { ok: false; reason: string };

export async function readCertificate(hostname: string, timeoutMs = 6000): Promise<CertificateReading> {
  let address: string;
  try {
    // Same SSRF guard as every other probe: never connect to a private address.
    address = (await assertPublicHost(hostname)).addresses[0];
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "the host could not be resolved" };
  }
  const tls = await import("node:tls");
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: CertificateReading) => { if (!settled) { settled = true; resolve(r); } };
    try {
      const socket = tls.connect(
        { host: address, port: 443, servername: hostname, rejectUnauthorized: false },
        () => {
          const cert = socket.getPeerCertificate();
          const authorized = socket.authorized;
          const authorizationError = socket.authorizationError ? String(socket.authorizationError) : null;
          socket.end();
          const validTo = cert?.valid_to ? new Date(cert.valid_to) : null;
          if (!validTo || Number.isNaN(validTo.getTime())) {
            done({ ok: false, reason: "the server presented no readable certificate" });
            return;
          }
          const issuer = cert.issuer ? (cert.issuer.O ?? cert.issuer.CN ?? null) : null;
          done({ ok: true, validTo, issuer: Array.isArray(issuer) ? issuer.join(", ") : issuer, authorized, authorizationError });
        },
      );
      socket.setTimeout(timeoutMs, () => { socket.destroy(); done({ ok: false, reason: `no TLS answer within ${Math.round(timeoutMs / 1000)}s` }); });
      socket.on("error", (e) => done({ ok: false, reason: `the TLS connection failed (${(e as NodeJS.ErrnoException).code ?? e.message})` }));
    } catch (error) {
      done({ ok: false, reason: error instanceof Error ? error.message : "the TLS connection failed" });
    }
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;
const KEY = "certificate_expiry_30d";
const LABEL = "SSL cert not expiring within 30 days";

/** FAIL under 7 days (or expired), WARN under 30, PASS otherwise, INCONCLUSIVE when it could not be read. */
export function certificateExpiryCheck(hostname: string, reading: CertificateReading, now = new Date()): PulseScanCheckInput {
  const base = { category: CATEGORIES.SECURITY, checkKey: KEY, label: LABEL } as const;
  if (!reading.ok) {
    return { ...base, status: "INCONCLUSIVE", detail: `The certificate for ${hostname} could not be read (${reading.reason}), so its expiry could not be established.` };
  }
  const days = Math.floor((reading.validTo.getTime() - now.getTime()) / DAY_MS);
  const date = reading.validTo.toISOString().slice(0, 10);
  const evidence = `valid_to ${date}${reading.issuer ? ` · issuer ${reading.issuer}` : ""}${reading.authorizationError ? ` · ${reading.authorizationError}` : ""}`;
  if (days < 0) {
    return { ...base, status: "FAIL", confidence: "HIGH", detail: `The certificate for ${hostname} expired on ${date}. Browsers refuse the connection until it is renewed.`, evidence };
  }
  if (days < 7) {
    return { ...base, status: "FAIL", confidence: "HIGH", detail: `The certificate for ${hostname} expires in ${days} day${days !== 1 ? "s" : ""} (${date}). Renew it now — once it lapses, browsers block the site.`, evidence };
  }
  if (days < 30) {
    return { ...base, status: "WARN", confidence: "HIGH", detail: `The certificate for ${hostname} expires in ${days} days (${date}). If renewal is automated (Let's Encrypt renews around 30 days out) this clears on its own; confirm the renewal job is running.`, evidence };
  }
  return { ...base, status: "PASS", confidence: "HIGH", detail: `The certificate for ${hostname} is valid for another ${days} days (until ${date}).`, evidence };
}
