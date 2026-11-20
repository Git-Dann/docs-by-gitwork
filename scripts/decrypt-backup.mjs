#!/usr/bin/env node
// Decrypt an off-site database backup (src/server/db-backup.ts) back into a pg_dump file.
//
//   BACKUP_ENCRYPTION_KEY=... node scripts/decrypt-backup.mjs foundry-….dump.enc foundry.dump
//   pg_restore --list foundry.dump            # check it
//   pg_restore --no-owner -d <database-url> foundry.dump
//
// Format: "FDB1" | 12-byte IV | AES-256-GCM ciphertext | 16-byte tag. The key is never written
// to disk. A wrong key or a damaged file fails on the tag and leaves no output file behind.
import { createDecipheriv } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const [src, dest] = process.argv.slice(2);
if (!src || !dest) {
  console.error("usage: BACKUP_ENCRYPTION_KEY=<base64> node scripts/decrypt-backup.mjs <in.dump.enc> <out.dump>");
  process.exit(2);
}
const key = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY ?? "", "base64");
if (key.length !== 32) {
  console.error("BACKUP_ENCRYPTION_KEY must be the base64 32-byte key the backup was made with.");
  process.exit(2);
}
const file = readFileSync(src);
if (file.subarray(0, 4).toString("ascii") !== "FDB1") {
  console.error(`${src} is not a Foundry backup (no FDB1 header).`);
  process.exit(1);
}
const iv = file.subarray(4, 16);
const tag = file.subarray(file.length - 16);
const decipher = createDecipheriv("aes-256-gcm", key, iv);
decipher.setAuthTag(tag);
try {
  const plain = Buffer.concat([decipher.update(file.subarray(16, file.length - 16)), decipher.final()]);
  writeFileSync(dest, plain, { mode: 0o600 });
  console.log(`Wrote ${dest} (${plain.length} bytes).`);
} catch {
  console.error("Could not decrypt: wrong key, or the file is damaged or incomplete.");
  process.exit(1);
}
