# Upload storage — Postgres or S3-compatible object storage

`src/server/blob-storage.ts` decides where the bytes of an uploaded file live. It
covers three upload stores:

| Store | Model | Columns used when in Postgres |
|---|---|---|
| Request screenshots | `ClientWikiIntakeItem` | `image`, `thumb` |
| Reply screenshots | `ClientWikiIntakeComment` | `image`, `thumb` |
| Launchpad requirement files | `LaunchpadItemFile` | `bytes` |

Other `bytea` columns (expense receipts, task attachments, `fileData`) are **not**
covered and still live in Postgres. A promoted request's screenshot is copied *into*
its task attachment's columns, so deleting the request never breaks the task.

## Default: nothing changes

With `BLOB_STORAGE_DRIVER` unset (or `postgres`), uploads are written to the columns
above exactly as they always were and `storageKey` stays null. The abstraction is a
passthrough.

## Switching on object storage

Set all of these in the VPS `.env` (or as GitHub Actions secrets of the same name —
`deploy.yml` syncs them; an unset secret leaves `.env` untouched):

| Variable | Required | Notes |
|---|---|---|
| `BLOB_STORAGE_DRIVER` | yes | `s3` |
| `BLOB_S3_BUCKET` | yes | |
| `BLOB_S3_REGION` | yes | AWS region, or `auto` for Cloudflare R2 |
| `BLOB_S3_ENDPOINT` | no | Custom endpoint for R2/MinIO, e.g. `https://<account>.r2.cloudflarestorage.com`. Unset → AWS (virtual-hosted URLs). With an endpoint, path-style URLs are used. |
| `BLOB_S3_ACCESS_KEY_ID` | yes | Needs `PutObject`, `GetObject`, `DeleteObject` on the bucket — nothing else. |
| `BLOB_S3_SECRET_ACCESS_KEY` | yes | |

Keep the bucket **private**. Files are never linked to directly: they are always
streamed through the existing download routes, so the auth checks and response
headers (`nosniff`, the `sandbox` CSP, `Content-Disposition: attachment` on
Launchpad files) are unchanged.

With the driver on, a new upload goes to `<namespace>/<uuid>` in the bucket
(`wiki-intake-item/<id>/…`, `wiki-intake-comment/<id>/…`, `launchpad/<kitId>/…`); a
screenshot's thumbnail is stored beside it at `<key>.thumb`. The row records
`storageKey` and its byte columns stay null.

### It fails loudly, never silently

`BLOB_STORAGE_DRIVER=s3` with any `BLOB_S3_*` variable missing, an unknown driver
value, or a malformed endpoint makes the **first upload fail with a message naming
the problem**. It never falls back to Postgres: an operator who believes uploads are
going to the bucket must not discover months later that the database kept filling.

## Reads follow the row, not the driver

- A row **without** `storageKey` is read from its columns — always, whatever the
  driver says. Every row written before the switch keeps working forever.
- A row **with** `storageKey` is read from the bucket. This needs the `BLOB_S3_*`
  variables to be set, **even if the driver has been switched back to `postgres`**.
  Switching back only changes where *new* uploads go; remove the bucket credentials
  and every file uploaded while the driver was `s3` stops serving (the download route
  errors with "This file is in object storage … but the BLOB_S3_* variables are not
  set").

There is no automatic migration of existing rows in either direction.

## Deletes

Deleting a reply, a Launchpad file or a request, or replacing a screenshot, deletes
the old object(s) **best-effort**: a failure is logged (`[blob-storage] could not
delete …`) and the user's action still succeeds, because the row is already gone and
an orphaned object costs storage, not correctness. Objects are also orphaned when a
whole wiki, client or Launchpad kit is deleted, because those rows go by database
cascade and the bucket is not part of that transaction. A periodic sweep of keys no
row references would reclaim them; it is not built.

## No AWS SDK

The three requests (PUT, GET, DELETE of one object) are signed with SigV4 over
`node:crypto` + `fetch`. The signer is tested against AWS's own published example
vectors (`src/server/__tests__/blob-storage.test.ts`).
