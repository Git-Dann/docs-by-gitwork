/**
 * Upload storage — where the bytes of an uploaded file live.
 *
 * Three upload stores go through this module: request screenshots
 * (`ClientWikiIntakeItem.image/thumb`), reply screenshots
 * (`ClientWikiIntakeComment.image/thumb`) and Launchpad files
 * (`LaunchpadItemFile.bytes`). Everything else that keeps bytes in Postgres
 * (expenses, task attachments, `fileData`) is deliberately untouched.
 *
 * Two drivers, chosen by `BLOB_STORAGE_DRIVER`:
 *
 *   - `postgres` (the default, and what an unset variable means) — nothing changes:
 *     the bytes go in the row's own `bytea` columns exactly as before, and this
 *     module is a passthrough.
 *   - `s3` — the bytes go to an S3-compatible bucket (AWS, Cloudflare R2, MinIO),
 *     the row records `storageKey`, and its `bytea` columns stay null.
 *
 * Reads never consult the driver. A row with a `storageKey` is read from the bucket;
 * a row without one is read from its columns. So rows written before a switch keep
 * working forever, in either direction — with one condition: a row written to the
 * bucket can only be served while the `BLOB_S3_*` variables are still set, even after
 * the driver is switched back to `postgres`. See docs/blob-storage.md.
 *
 * ⚠️ A misconfigured bucket fails LOUDLY at first use and never falls back to
 * Postgres. A silent fallback would mean an operator who believes uploads are going
 * to object storage is in fact still filling the database — the problem the switch
 * exists to solve — with nothing to say so.
 *
 * No AWS SDK: the three requests needed (PUT, GET, DELETE of one object) are signed
 * with SigV4 over node:crypto + fetch. `signS3Request` is unit-tested against AWS's
 * own published example vectors.
 */
import { createHash, createHmac, randomUUID } from "node:crypto";

// ─── Config ───────────────────────────────────────────────────────────────────

export type BlobDriver = "postgres" | "s3";

export interface S3Config {
  bucket: string;
  region: string;
  /** Custom endpoint (R2, MinIO). Absent → AWS virtual-hosted URLs. */
  endpoint: string | null;
  accessKeyId: string;
  secretAccessKey: string;
}

/** Thrown when the storage env is wrong. Never caught-and-ignored on a write path. */
export class BlobStorageConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlobStorageConfigError";
  }
}

type Env = Record<string, string | undefined>;

const S3_VARS = [
  "BLOB_S3_BUCKET",
  "BLOB_S3_REGION",
  "BLOB_S3_ACCESS_KEY_ID",
  "BLOB_S3_SECRET_ACCESS_KEY",
] as const;

function clean(v: string | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

/** Which driver new uploads go to. Unknown values throw rather than guess. */
export function resolveBlobDriver(env: Env = process.env): BlobDriver {
  const raw = clean(env.BLOB_STORAGE_DRIVER)?.toLowerCase() ?? "postgres";
  if (raw === "postgres" || raw === "s3") return raw;
  throw new BlobStorageConfigError(
    `BLOB_STORAGE_DRIVER is "${env.BLOB_STORAGE_DRIVER}" — it must be "postgres" or "s3".`,
  );
}

/**
 * The bucket settings, or null when NONE of the S3 variables is set. A partial set
 * is a misconfiguration and throws, naming every missing variable.
 */
export function resolveS3Config(env: Env = process.env): S3Config | null {
  const present = S3_VARS.filter((k) => clean(env[k]));
  if (present.length === 0 && !clean(env.BLOB_S3_ENDPOINT)) return null;
  const missing = S3_VARS.filter((k) => !clean(env[k]));
  if (missing.length > 0) {
    throw new BlobStorageConfigError(
      `Object storage is partly configured: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not set.`,
    );
  }
  const endpoint = clean(env.BLOB_S3_ENDPOINT);
  if (endpoint) {
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      throw new BlobStorageConfigError(`BLOB_S3_ENDPOINT "${endpoint}" is not a URL.`);
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new BlobStorageConfigError(`BLOB_S3_ENDPOINT must be http(s), got "${url.protocol}".`);
    }
  }
  return {
    bucket: clean(env.BLOB_S3_BUCKET)!,
    region: clean(env.BLOB_S3_REGION)!,
    endpoint: endpoint ? endpoint.replace(/\/+$/, "") : null,
    accessKeyId: clean(env.BLOB_S3_ACCESS_KEY_ID)!,
    secretAccessKey: clean(env.BLOB_S3_SECRET_ACCESS_KEY)!,
  };
}

// ─── The store interface ──────────────────────────────────────────────────────

export interface BlobStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** The object's bytes, or null when it does not exist. */
  get(key: string): Promise<Buffer | null>;
  /** Idempotent: deleting a missing object is not an error. */
  delete(key: string): Promise<void>;
}

// ─── SigV4 ────────────────────────────────────────────────────────────────────

const sha256Hex = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();

/** RFC 3986 encoding, as SigV4 requires. `/` is kept in an S3 object path. */
export function awsUriEncode(s: string, keepSlash: boolean): string {
  let out = "";
  for (const ch of s) {
    if (/[A-Za-z0-9\-._~]/.test(ch) || (keepSlash && ch === "/")) out += ch;
    else for (const b of Buffer.from(ch, "utf8")) out += "%" + b.toString(16).toUpperCase().padStart(2, "0");
  }
  return out;
}

export function deriveSigningKey(secret: string, date: string, region: string, service: string): Buffer {
  const kDate = hmac("AWS4" + secret, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

export interface SignInput {
  method: string;
  /** Already-encoded canonical path, e.g. `/bucket/a%20b.png`. */
  canonicalPath: string;
  /** Headers to sign, INCLUDING host, x-amz-date and x-amz-content-sha256. */
  headers: Record<string, string>;
  payloadHash: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** `YYYYMMDDTHHMMSSZ` — must equal headers["x-amz-date"]. */
  amzDate: string;
}

/** The `Authorization` header value for one request (no query string). */
export function signS3Request(input: SignInput): { authorization: string; signature: string } {
  const lowered = Object.entries(input.headers).map(([k, v]) => [k.toLowerCase(), v.trim().replace(/\s+/g, " ")] as const);
  lowered.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const canonicalHeaders = lowered.map(([k, v]) => `${k}:${v}\n`).join("");
  const signedHeaders = lowered.map(([k]) => k).join(";");
  const canonicalRequest = [
    input.method,
    input.canonicalPath,
    "",
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join("\n");
  const date = input.amzDate.slice(0, 8);
  const scope = `${date}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", input.amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", deriveSigningKey(input.secretAccessKey, date, input.region, input.service))
    .update(stringToSign)
    .digest("hex");
  return {
    signature,
    authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

function amzDateOf(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// ─── S3 driver ────────────────────────────────────────────────────────────────

/** Where one object lives. Custom endpoints use path-style; AWS uses virtual-hosted. */
export function s3ObjectUrl(cfg: S3Config, key: string): URL {
  const encodedKey = awsUriEncode(key, true);
  if (cfg.endpoint) {
    return new URL(`${cfg.endpoint}/${awsUriEncode(cfg.bucket, false)}/${encodedKey}`);
  }
  return new URL(`https://${cfg.bucket}.s3.${cfg.region}.amazonaws.com/${encodedKey}`);
}

export function createS3BlobStore(
  cfg: S3Config,
  deps: { fetch?: typeof fetch; now?: () => Date } = {},
): BlobStore {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? (() => new Date());

  async function send(method: "PUT" | "GET" | "DELETE", key: string, body?: Uint8Array, contentType?: string) {
    const url = s3ObjectUrl(cfg, key);
    const amzDate = amzDateOf(now());
    const payloadHash = sha256Hex(body ?? new Uint8Array());
    const signed: Record<string, string> = {
      host: url.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    };
    if (contentType) signed["content-type"] = contentType;
    const { authorization } = signS3Request({
      method,
      // The URL's pathname is already encoded exactly as signed; using it keeps the
      // two from ever disagreeing.
      canonicalPath: url.pathname,
      headers: signed,
      payloadHash,
      region: cfg.region,
      service: "s3",
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      amzDate,
    });
    // `host` is set by fetch from the URL — it is a forbidden request header — and
    // is the same value that was signed.
    const { host: _host, ...headers } = signed;
    void _host;
    return doFetch(url, {
      method,
      headers: { ...headers, authorization },
      body: body ? Buffer.from(body) : undefined,
      cache: "no-store",
    });
  }

  async function failure(res: Response, what: string): Promise<Error> {
    const text = await res.text().catch(() => "");
    const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1];
    return new Error(`Object storage ${what} failed: HTTP ${res.status}${code ? ` (${code})` : ""}`);
  }

  return {
    async put(key, bytes, contentType) {
      const res = await send("PUT", key, bytes, contentType);
      if (!res.ok) throw await failure(res, `upload of ${key}`);
    },
    async get(key) {
      const res = await send("GET", key);
      if (res.status === 404) return null;
      if (!res.ok) throw await failure(res, `read of ${key}`);
      return Buffer.from(await res.arrayBuffer());
    },
    async delete(key) {
      const res = await send("DELETE", key);
      if (res.status === 404) return;
      if (!res.ok) throw await failure(res, `delete of ${key}`);
    },
  };
}

// ─── What the upload code calls ───────────────────────────────────────────────

let storeOverride: { driver: BlobDriver; store: BlobStore | null } | null = null;

/** Tests only: pin the driver and store. Pass null to go back to the env. */
export function __setBlobStoreForTests(v: { driver: BlobDriver; store: BlobStore | null } | null): void {
  storeOverride = v;
}

/** The store new uploads are written to — null means "keep them in the row's columns". */
function writeStore(): BlobStore | null {
  if (storeOverride) return storeOverride.driver === "s3" ? storeOverride.store : null;
  if (resolveBlobDriver() === "postgres") return null;
  const cfg = resolveS3Config();
  if (!cfg) {
    throw new BlobStorageConfigError(
      `BLOB_STORAGE_DRIVER is "s3" but ${S3_VARS.join(", ")} are not set. Set them, or set the driver back to "postgres".`,
    );
  }
  return createS3BlobStore(cfg);
}

/** The store a row with a `storageKey` is read from — regardless of the current driver. */
function readStore(key: string): BlobStore {
  if (storeOverride?.store) return storeOverride.store;
  const cfg = resolveS3Config();
  if (!cfg) {
    throw new BlobStorageConfigError(
      `This file is in object storage (${key}) but the BLOB_S3_* variables are not set, so it cannot be read.`,
    );
  }
  return createS3BlobStore(cfg);
}

/** The thumbnail object stored beside an image. */
export function thumbKeyOf(storageKey: string): string {
  return `${storageKey}.thumb`;
}

export interface PlacedUpload {
  /** Set when the bytes went to object storage; null when they belong in the columns. */
  storageKey: string | null;
  /** What to write in the row's main bytea column (null when stored in the bucket). */
  bytes: Uint8Array | null;
  /** What to write in the row's thumb column, if it has one. */
  thumb: Uint8Array | null;
}

/**
 * Put a new upload wherever the driver says. With `postgres` this returns the bytes
 * untouched for the caller to write to its columns; with `s3` it uploads them (and
 * the thumbnail, if any) under a fresh key and returns that key with null bytes.
 *
 * Every upload gets a new random key, so replacing a file never overwrites an object
 * a still-committed row points at — the caller deletes the old key once its row
 * update has committed.
 */
export async function placeUpload(
  namespace: string,
  upload: { bytes: Uint8Array; thumb?: Uint8Array | null; contentType: string },
): Promise<PlacedUpload> {
  const store = writeStore();
  if (!store) return { storageKey: null, bytes: upload.bytes, thumb: upload.thumb ?? null };
  const key = `${namespace}/${randomUUID()}`;
  await store.put(key, upload.bytes, upload.contentType);
  if (upload.thumb) {
    try {
      await store.put(thumbKeyOf(key), upload.thumb, "image/jpeg");
    } catch (err) {
      await deleteStoredUpload(key);
      throw err;
    }
  }
  return { storageKey: key, bytes: null, thumb: null };
}

/**
 * Read one stored upload. A row with a `storageKey` is fetched from the bucket;
 * otherwise its column is returned. `variant: "thumb"` reads the thumbnail object,
 * falling back to the full image (the same fallback the column reads always had).
 */
export async function readStoredUpload(
  row: { storageKey: string | null; bytes: Uint8Array | null; thumb?: Uint8Array | null },
  variant: "full" | "thumb" = "full",
): Promise<Buffer | null> {
  if (!row.storageKey) {
    const col = variant === "thumb" ? (row.thumb ?? row.bytes) : row.bytes;
    return col ? Buffer.from(col) : null;
  }
  const store = readStore(row.storageKey);
  if (variant === "thumb") {
    const thumb = await store.get(thumbKeyOf(row.storageKey));
    if (thumb) return thumb;
  }
  return store.get(row.storageKey);
}

/**
 * Delete a stored upload (and its thumbnail), best-effort: a failure is logged and
 * swallowed, because the row is already gone or replaced and an orphaned object
 * costs storage, not correctness. A null key is a no-op (the bytes were in the row).
 */
export async function deleteStoredUpload(storageKey: string | null | undefined): Promise<void> {
  if (!storageKey) return;
  try {
    const store = readStore(storageKey);
    await Promise.all([store.delete(storageKey), store.delete(thumbKeyOf(storageKey))]);
  } catch (err) {
    console.warn(`[blob-storage] could not delete ${storageKey}:`, err instanceof Error ? err.message : err);
  }
}
