/**
 * Canonical export filename for a document: `{client}-{title}-{ref}`.
 *
 * Single source of truth for both the in-app print view (`document.title`, which the browser's
 * own "Save as PDF" dialog suggests as the filename) and the server PDF routes' `Content-
 * Disposition` filename — so a document downloads with the same name whichever path exported it.
 *
 * Any missing part is omitted rather than left as a stray "undefined" or a doubled separator, since
 * `clientName`/`documentNumber` are both optional on a document and plenty of real ones have
 * neither set yet.
 */
export function buildDocumentFilename(doc: {
  clientName?: string | null;
  title?: string | null;
  documentNumber?: string | null;
}): string {
  const parts = [doc.clientName, doc.title, doc.documentNumber]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  const base = parts.length ? parts.join("-") : "document";
  // Filesystem/header-unsafe characters only — spaces and casing are left alone so the name still
  // reads naturally in a "Save As" dialog rather than turning into word-hyphen-word-hyphen-word.
  return base.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
}
