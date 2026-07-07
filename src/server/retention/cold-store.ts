/**
 * Cold store — where the retention framework offloads aged, gzipped payloads.
 *
 * Two adapters, no new vendor (per the data-lifecycle plan):
 *   - "fs"    → the VPS local filesystem (a Docker-mounted volume at `COLD_STORE_DIR`). Preferred
 *              when set: cheapest, off the Postgres working set AND off `pg_dump`.
 *   - "drive" → the backup account's Google Drive (a "Foundry Cold Storage" folder). The default
 *              when `COLD_STORE_DIR` is unset — works today with zero new infra, reusing the same
 *              backup account + `docsBackupEnabled` switch as the Docs/client-archive backups.
 *
 * A third adapter (R2/S3) can slot in later behind the same `ColdStore` interface without touching
 * callers. Payloads are JSON, gzipped, so cold storage stays small.
 */

import { gzipSync, gunzipSync } from "node:zlib";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import {
  driveFor,
  resolveBackupAuth,
  type DriveClient,
} from "@/server/google-drive-backup";
import { prisma } from "@/lib/prisma";

export interface ColdRef {
  store: "fs" | "drive";
  ref: string;
}

export interface ColdStore {
  readonly kind: "fs" | "drive";
  /** Serialise + gzip `value` and store it under a logical `key`. Returns a retrieval ref. */
  putJson(key: string, value: unknown): Promise<ColdRef & { byteSize: number }>;
  /** Fetch + gunzip + parse a previously-stored value. Throws if the ref is gone. */
  getJson<T = unknown>(ref: ColdRef): Promise<T>;
  /** Permanently delete a cold object (the destructive purge step). Idempotent on already-gone. */
  remove(ref: ColdRef): Promise<void>;
}

const COLD_STORE_FOLDER_NAME = "Foundry Cold Storage";
const FOLDER_MIME = "application/vnd.google-apps.folder";

// ── Filesystem adapter ────────────────────────────────────────────────────────

class FsColdStore implements ColdStore {
  readonly kind = "fs" as const;
  constructor(private readonly baseDir: string) {}

  private pathFor(key: string): string {
    // Namespace by key but keep it filesystem-safe.
    const safe = key.replace(/[^a-zA-Z0-9._/-]/g, "_");
    return path.join(this.baseDir, `${safe}.json.gz`);
  }

  async putJson(key: string, value: unknown) {
    const gz = gzipSync(Buffer.from(JSON.stringify(value)));
    const target = this.pathFor(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, gz);
    return { store: this.kind, ref: target, byteSize: gz.byteLength };
  }

  async getJson<T>(ref: ColdRef): Promise<T> {
    const gz = await fs.readFile(ref.ref);
    return JSON.parse(gunzipSync(gz).toString("utf8")) as T;
  }

  async remove(ref: ColdRef): Promise<void> {
    await fs.rm(ref.ref, { force: true });
  }
}

// ── Google Drive adapter ──────────────────────────────────────────────────────

class DriveColdStore implements ColdStore {
  readonly kind = "drive" as const;
  constructor(
    private readonly drive: DriveClient,
    private readonly folderId: string,
  ) {}

  async putJson(key: string, value: unknown) {
    const gz = gzipSync(Buffer.from(JSON.stringify(value)));
    const name = `${key.replace(/[^a-zA-Z0-9._-]/g, "_")}.json.gz`;
    const res = await this.drive.files.create({
      requestBody: { name, parents: [this.folderId], mimeType: "application/gzip" },
      media: { mimeType: "application/gzip", body: Readable.from(gz) },
      fields: "id",
    });
    const id = res.data.id;
    if (!id) throw new Error("Drive did not return a file id for cold-store object");
    return { store: this.kind, ref: id, byteSize: gz.byteLength };
  }

  async getJson<T>(ref: ColdRef): Promise<T> {
    const res = await this.drive.files.get(
      { fileId: ref.ref, alt: "media" },
      { responseType: "arraybuffer" },
    );
    const gz = Buffer.from(res.data as ArrayBuffer);
    return JSON.parse(gunzipSync(gz).toString("utf8")) as T;
  }

  async remove(ref: ColdRef): Promise<void> {
    try {
      await this.drive.files.delete({ fileId: ref.ref });
    } catch (err) {
      const e = err as { code?: number; response?: { status?: number } };
      if (e?.code !== 404 && e?.response?.status !== 404) throw err;
    }
  }
}

async function ensureColdStoreFolder(
  drive: DriveClient,
  workspaceId: string,
  existingFolderId: string | null,
): Promise<string> {
  if (existingFolderId) {
    try {
      const res = await drive.files.get({ fileId: existingFolderId, fields: "id, trashed" });
      if (res.data.id && !res.data.trashed) return res.data.id;
    } catch (err) {
      const e = err as { code?: number; response?: { status?: number } };
      if (e?.code !== 404 && e?.response?.status !== 404) throw err;
    }
  }
  const created = await drive.files.create({
    requestBody: { name: COLD_STORE_FOLDER_NAME, mimeType: FOLDER_MIME },
    fields: "id",
  });
  const id = created.data.id;
  if (!id) throw new Error("Drive did not return a cold-store folder id");
  await prisma.workspace.update({ where: { id: workspaceId }, data: { coldStoreFolderId: id } });
  return id;
}

/**
 * Resolve the cold store for a workspace. Filesystem when `COLD_STORE_DIR` is set (preferred),
 * otherwise Drive (needs a connected backup account + `docsBackupEnabled`). Returns null when the
 * Drive path is selected but unavailable — the sweep then skips that policy cleanly.
 */
export async function getColdStore(workspace: {
  id: string;
  docsBackupEnabled: boolean;
  coldStoreFolderId: string | null;
}): Promise<ColdStore | null> {
  const dir = process.env.COLD_STORE_DIR;
  if (dir && dir.trim()) {
    return new FsColdStore(path.join(dir, workspace.id));
  }

  const backupAuth = await resolveBackupAuth(workspace);
  if (!backupAuth) return null;
  const drive = driveFor(backupAuth.client);
  const folderId = await ensureColdStoreFolder(drive, workspace.id, workspace.coldStoreFolderId);
  return new DriveColdStore(drive, folderId);
}
