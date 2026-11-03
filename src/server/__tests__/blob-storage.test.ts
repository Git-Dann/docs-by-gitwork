/**
 * Upload storage (src/server/blob-storage.ts).
 *
 * The SigV4 cases are AWS's own published example vectors (S3 "Signature
 * Calculations for the Authorization Header" — GET Object and PUT Object — and the
 * IAM signing-key derivation example), not values produced by this code.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BlobStorageConfigError,
  __setBlobStoreForTests,
  awsUriEncode,
  createS3BlobStore,
  deleteStoredUpload,
  deriveSigningKey,
  placeUpload,
  readStoredUpload,
  resolveBlobDriver,
  resolveS3Config,
  s3ObjectUrl,
  signS3Request,
  thumbKeyOf,
  type BlobStore,
  type S3Config,
} from "../blob-storage";

const EXAMPLE_SECRET = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
const EMPTY_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const FULL_ENV = {
  BLOB_STORAGE_DRIVER: "s3",
  BLOB_S3_BUCKET: "foundry-uploads",
  BLOB_S3_REGION: "eu-west-2",
  BLOB_S3_ACCESS_KEY_ID: "AKIDEXAMPLE",
  BLOB_S3_SECRET_ACCESS_KEY: "secret",
};

afterEach(() => {
  __setBlobStoreForTests(null);
  vi.unstubAllEnvs();
});

describe("SigV4 against AWS's published vectors", () => {
  it("derives the documented IAM signing key", () => {
    expect(
      deriveSigningKey("wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", "20120215", "us-east-1", "iam").toString("hex"),
    ).toBe("f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d");
  });

  it("signs the S3 GET Object example", () => {
    const { signature, authorization } = signS3Request({
      method: "GET",
      canonicalPath: "/test.txt",
      headers: {
        host: "examplebucket.s3.amazonaws.com",
        range: "bytes=0-9",
        "x-amz-content-sha256": EMPTY_HASH,
        "x-amz-date": "20130524T000000Z",
      },
      payloadHash: EMPTY_HASH,
      region: "us-east-1",
      service: "s3",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: EXAMPLE_SECRET,
      amzDate: "20130524T000000Z",
    });
    expect(signature).toBe("f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41");
    expect(authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, " +
        "SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, " +
        "Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
    );
  });

  it("signs the S3 PUT Object example (encoded `$` in the key)", () => {
    const payloadHash = "44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072";
    const { signature } = signS3Request({
      method: "PUT",
      canonicalPath: "/" + awsUriEncode("test$file.text", true),
      headers: {
        host: "examplebucket.s3.amazonaws.com",
        date: "Fri, 24 May 2013 00:00:00 GMT",
        "x-amz-storage-class": "REDUCED_REDUNDANCY",
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": "20130524T000000Z",
      },
      payloadHash,
      region: "us-east-1",
      service: "s3",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: EXAMPLE_SECRET,
      amzDate: "20130524T000000Z",
    });
    expect(signature).toBe("98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd");
  });

  it("URI-encodes per RFC 3986, keeping `/` only in a path", () => {
    expect(awsUriEncode("a b/c$d~e", true)).toBe("a%20b/c%24d~e");
    expect(awsUriEncode("a/b", false)).toBe("a%2Fb");
    expect(awsUriEncode("é", true)).toBe("%C3%A9");
  });
});

describe("driver selection", () => {
  it("defaults to postgres when unset or blank", () => {
    expect(resolveBlobDriver({})).toBe("postgres");
    expect(resolveBlobDriver({ BLOB_STORAGE_DRIVER: "  " })).toBe("postgres");
    expect(resolveBlobDriver({ BLOB_STORAGE_DRIVER: "S3" })).toBe("s3");
  });

  it("refuses an unknown driver rather than guessing", () => {
    expect(() => resolveBlobDriver({ BLOB_STORAGE_DRIVER: "gcs" })).toThrow(BlobStorageConfigError);
  });

  it("returns no S3 config when nothing is set, and names every missing var when partly set", () => {
    expect(resolveS3Config({})).toBeNull();
    expect(() => resolveS3Config({ BLOB_S3_BUCKET: "b" })).toThrow(
      /BLOB_S3_REGION, BLOB_S3_ACCESS_KEY_ID, BLOB_S3_SECRET_ACCESS_KEY are not set/,
    );
    expect(() => resolveS3Config({ BLOB_S3_ENDPOINT: "https://r2.example" })).toThrow(BlobStorageConfigError);
  });

  it("rejects a non-http endpoint", () => {
    expect(() => resolveS3Config({ ...FULL_ENV, BLOB_S3_ENDPOINT: "ftp://x" })).toThrow(/http/);
  });

  it("fails loudly at first use when the driver is s3 but the bucket is not configured", async () => {
    vi.stubEnv("BLOB_STORAGE_DRIVER", "s3");
    for (const k of Object.keys(FULL_ENV)) if (k !== "BLOB_STORAGE_DRIVER") vi.stubEnv(k, "");
    await expect(
      placeUpload("x", { bytes: new Uint8Array([1]), contentType: "image/png" }),
    ).rejects.toThrow(/BLOB_STORAGE_DRIVER is "s3"/);
  });

  it("does not fall back to postgres when the s3 config is partial", async () => {
    vi.stubEnv("BLOB_STORAGE_DRIVER", "s3");
    vi.stubEnv("BLOB_S3_BUCKET", "b");
    vi.stubEnv("BLOB_S3_REGION", "");
    vi.stubEnv("BLOB_S3_ACCESS_KEY_ID", "");
    vi.stubEnv("BLOB_S3_SECRET_ACCESS_KEY", "");
    await expect(
      placeUpload("x", { bytes: new Uint8Array([1]), contentType: "image/png" }),
    ).rejects.toBeInstanceOf(BlobStorageConfigError);
  });
});

describe("postgres passthrough — today's behaviour", () => {
  it("returns the bytes untouched and no key, touching no store", async () => {
    vi.stubEnv("BLOB_STORAGE_DRIVER", "");
    const bytes = new Uint8Array([1, 2, 3]);
    const thumb = new Uint8Array([9]);
    const placed = await placeUpload("wiki-intake-item", { bytes, thumb, contentType: "image/png" });
    expect(placed).toEqual({ storageKey: null, bytes, thumb });
    expect(placed.bytes).toBe(bytes);
  });

  it("reads a row with no storageKey from its columns, thumb falling back to full", async () => {
    const full = new Uint8Array([1, 2]);
    expect(await readStoredUpload({ storageKey: null, bytes: full, thumb: new Uint8Array([7]) }, "thumb")).toEqual(
      Buffer.from([7]),
    );
    expect(await readStoredUpload({ storageKey: null, bytes: full, thumb: null }, "thumb")).toEqual(Buffer.from(full));
    expect(await readStoredUpload({ storageKey: null, bytes: full })).toEqual(Buffer.from(full));
    expect(await readStoredUpload({ storageKey: null, bytes: null })).toBeNull();
  });

  it("reads a column row even when the driver is s3 (old rows keep working)", async () => {
    const store = memoryStore();
    __setBlobStoreForTests({ driver: "s3", store });
    expect(await readStoredUpload({ storageKey: null, bytes: new Uint8Array([5]) })).toEqual(Buffer.from([5]));
    expect(store.calls).toEqual([]);
  });

  it("deleting a column-stored upload is a no-op", async () => {
    const store = memoryStore();
    __setBlobStoreForTests({ driver: "s3", store });
    await deleteStoredUpload(null);
    expect(store.calls).toEqual([]);
  });
});

describe("object storage via the abstraction", () => {
  it("puts the file and thumb under a fresh namespaced key and returns null bytes", async () => {
    const store = memoryStore();
    __setBlobStoreForTests({ driver: "s3", store });
    const placed = await placeUpload("wiki-intake-item/abc", {
      bytes: new Uint8Array([1, 2]),
      thumb: new Uint8Array([3]),
      contentType: "image/png",
    });
    expect(placed.bytes).toBeNull();
    expect(placed.thumb).toBeNull();
    expect(placed.storageKey).toMatch(/^wiki-intake-item\/abc\/[0-9a-f-]{36}$/);
    expect(store.objects.get(placed.storageKey!)).toEqual(Buffer.from([1, 2]));
    expect(store.objects.get(thumbKeyOf(placed.storageKey!))).toEqual(Buffer.from([3]));

    const again = await placeUpload("wiki-intake-item/abc", { bytes: new Uint8Array([1]), contentType: "x" });
    expect(again.storageKey).not.toBe(placed.storageKey);
  });

  it("reads a keyed row from the store, never its (null) column", async () => {
    const store = memoryStore();
    store.objects.set("k", Buffer.from([4]));
    store.objects.set(thumbKeyOf("k"), Buffer.from([8]));
    __setBlobStoreForTests({ driver: "postgres", store });
    expect(await readStoredUpload({ storageKey: "k", bytes: null })).toEqual(Buffer.from([4]));
    expect(await readStoredUpload({ storageKey: "k", bytes: null }, "thumb")).toEqual(Buffer.from([8]));
    store.objects.delete(thumbKeyOf("k"));
    expect(await readStoredUpload({ storageKey: "k", bytes: null }, "thumb")).toEqual(Buffer.from([4]));
  });

  it("cannot read a keyed row with no bucket configured, and says why", async () => {
    vi.stubEnv("BLOB_STORAGE_DRIVER", "postgres");
    for (const k of Object.keys(FULL_ENV)) if (k !== "BLOB_STORAGE_DRIVER") vi.stubEnv(k, "");
    await expect(readStoredUpload({ storageKey: "k", bytes: null })).rejects.toThrow(/in object storage \(k\)/);
  });

  it("removes the main object when the thumb upload fails", async () => {
    const store = memoryStore();
    store.failPutOn = (key) => key.endsWith(".thumb");
    __setBlobStoreForTests({ driver: "s3", store });
    await expect(
      placeUpload("ns", { bytes: new Uint8Array([1]), thumb: new Uint8Array([2]), contentType: "image/png" }),
    ).rejects.toThrow();
    expect(store.objects.size).toBe(0);
  });

  it("deletes best-effort: both objects, and a failure is swallowed", async () => {
    const store = memoryStore();
    store.objects.set("k", Buffer.from([1]));
    store.objects.set(thumbKeyOf("k"), Buffer.from([1]));
    __setBlobStoreForTests({ driver: "s3", store });
    await deleteStoredUpload("k");
    expect(store.objects.size).toBe(0);

    store.delete = async () => {
      throw new Error("network down");
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(deleteStoredUpload("k")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("S3 driver over fetch", () => {
  const cfg: S3Config = {
    bucket: "foundry-uploads",
    region: "eu-west-2",
    endpoint: null,
    accessKeyId: "AKIDEXAMPLE",
    secretAccessKey: "secret",
  };
  const fixedNow = () => new Date("2026-10-19T12:34:56.789Z");

  it("builds virtual-hosted AWS URLs and path-style custom-endpoint URLs", () => {
    expect(s3ObjectUrl(cfg, "a b/c.png").toString()).toBe(
      "https://foundry-uploads.s3.eu-west-2.amazonaws.com/a%20b/c.png",
    );
    expect(
      s3ObjectUrl({ ...cfg, region: "auto", endpoint: "https://acct.r2.cloudflarestorage.com" }, "x/y").toString(),
    ).toBe("https://acct.r2.cloudflarestorage.com/foundry-uploads/x/y");
  });

  it("PUTs with a correct, verifiable signature", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    const store = createS3BlobStore(cfg, { fetch: fetchMock as unknown as typeof fetch, now: fixedNow });
    const body = new Uint8Array([104, 105]);
    await store.put("ns/key.png", body, "image/png");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe("https://foundry-uploads.s3.eu-west-2.amazonaws.com/ns/key.png");
    expect(init.method).toBe("PUT");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-amz-date"]).toBe("20261019T123456Z");
    expect(headers["content-type"]).toBe("image/png");
    // sha256("hi")
    expect(headers["x-amz-content-sha256"]).toBe(
      "8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4",
    );
    expect(headers).not.toHaveProperty("host");

    const expected = signS3Request({
      method: "PUT",
      canonicalPath: "/ns/key.png",
      headers: {
        host: "foundry-uploads.s3.eu-west-2.amazonaws.com",
        "content-type": "image/png",
        "x-amz-content-sha256": headers["x-amz-content-sha256"],
        "x-amz-date": "20261019T123456Z",
      },
      payloadHash: headers["x-amz-content-sha256"],
      region: "eu-west-2",
      service: "s3",
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "secret",
      amzDate: "20261019T123456Z",
    });
    expect(headers.authorization).toBe(expected.authorization);
    expect(headers.authorization).toContain("Credential=AKIDEXAMPLE/20261019/eu-west-2/s3/aws4_request");
    expect(headers.authorization).toContain("SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date");
    expect(Buffer.from(init.body as Uint8Array)).toEqual(Buffer.from(body));
  });

  it("GET returns the bytes, null on 404, and throws with the S3 error code otherwise", async () => {
    const responses = [
      new Response(new Uint8Array([7, 8]), { status: 200 }),
      new Response("", { status: 404 }),
      new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403 }),
    ];
    const fetchMock = vi.fn(async () => responses.shift()!);
    const store = createS3BlobStore(cfg, { fetch: fetchMock as unknown as typeof fetch, now: fixedNow });
    expect(await store.get("a")).toEqual(Buffer.from([7, 8]));
    expect(await store.get("a")).toBeNull();
    await expect(store.get("a")).rejects.toThrow(/HTTP 403 \(AccessDenied\)/);
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["x-amz-content-sha256"]).toBe(EMPTY_HASH);
  });

  it("DELETE treats 404 as done and other failures as errors", async () => {
    const responses = [new Response(null, { status: 204 }), new Response(null, { status: 404 }), new Response("", { status: 500 })];
    const fetchMock = vi.fn(async () => responses.shift()!);
    const store = createS3BlobStore(cfg, { fetch: fetchMock as unknown as typeof fetch, now: fixedNow });
    await store.delete("a");
    await store.delete("a");
    await expect(store.delete("a")).rejects.toThrow(/HTTP 500/);
  });
});

// ─── helpers ──────────────────────────────────────────────────────────────────

function memoryStore(): BlobStore & {
  objects: Map<string, Buffer>;
  calls: string[];
  failPutOn?: (key: string) => boolean;
} {
  const objects = new Map<string, Buffer>();
  const calls: string[] = [];
  const s = {
    objects,
    calls,
    failPutOn: undefined as ((key: string) => boolean) | undefined,
    async put(key: string, bytes: Uint8Array) {
      calls.push(`put ${key}`);
      if (s.failPutOn?.(key)) throw new Error("put failed");
      objects.set(key, Buffer.from(bytes));
    },
    async get(key: string) {
      calls.push(`get ${key}`);
      return objects.get(key) ?? null;
    },
    async delete(key: string) {
      calls.push(`delete ${key}`);
      objects.delete(key);
    },
  };
  return s;
}
