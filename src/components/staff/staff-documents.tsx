"use client";

/**
 * A person's documents (docs/hr-platform.md, Phase 1b): what they must have on file, what
 * is on file, and adding more. Used on their Staff profile and in Backstage → Me, so the
 * person and HR always look at the same list.
 *
 * Everything shown is decided by the server (listDocuments): who sees which document, the
 * required checklist (person and HR only) and which types this viewer may add. Uploads use
 * EasyUI's Animated File Upload; a file already in Drive can be attached by link (HR).
 */

import { useState } from "react";
import { ArrowTopRightOnSquareIcon, ArrowDownTrayIcon, LinkIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { WidgetCard } from "@/components/codeclear/codeclear-shared";
import { DatePicker } from "@/components/ui/date-picker";
import { AnimatedFileUpload, uploadWithProgress } from "@/components/ui/easyui/animated-file-upload";
import { HeaderAction, formatDate, label, today } from "@/components/staff/profile-parts";
import { LAUNCHPAD_FILE_ACCEPT, LAUNCHPAD_FILE_MAX_BYTES, formatFileSize } from "@/lib/launchpad/files";
import { dateAttention } from "@/lib/hr";
import {
  EXPIRING_TYPES,
  REQUIREMENT_LABEL,
  STAFF_DOCUMENT_LABEL,
  VISIBILITY_LABEL,
  DOCUMENT_VISIBILITIES,
  type DocumentVisibility,
  type RequirementState,
  type StaffDocumentRecord,
  type StaffDocumentType,
} from "@/lib/hr-documents";
import {
  useDeleteDocument,
  useDocumentsInvalidate,
  useLinkDocument,
  useRequestDocument,
  useRetryDriveCopy,
  useStaffDocuments,
  useUpdateDocument,
} from "@/hooks/use-hr";

const STATE_TONE: Record<RequirementState, string> = {
  "on-file": "text-[var(--success-500)]",
  expiring: "text-[var(--warning-500)]",
  expired: "text-[var(--danger-500)]",
  "to-check": "text-[var(--warning-500)]",
  requested: "text-[var(--text-3)]",
  rejected: "text-[var(--danger-500)]",
  missing: "text-[var(--danger-500)]",
};

const chip = "font-mono text-[10px] uppercase tracking-[0.08em]";

function DocumentRow({ doc, recordId, canManage }: { doc: StaffDocumentRecord; recordId: string; canManage: boolean }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const update = useUpdateDocument(recordId);
  const remove = useDeleteDocument(recordId);
  const retry = useRetryDriveCopy(recordId);
  const att = doc.status === "ON_FILE" ? dateAttention(doc.expiresOn, today()) : null;
  const busy = update.isPending || remove.isPending;
  const error = [update.error, remove.error, retry.error].find(Boolean);

  const status =
    doc.status === "TO_CHECK" ? "To check" : doc.status === "REQUESTED" ? "Requested" : doc.status === "REJECTED" ? "Sent back" : null;

  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="truncate text-[14px] text-[var(--text-1)]" title={doc.title}>
            {doc.title}
            {status ? <span className={cn(chip, "ml-2 text-[var(--warning-500)]")}>{status}</span> : null}
          </p>
          <p className="truncate font-mono text-[11px] text-[var(--text-4)]">
            {[
              STAFF_DOCUMENT_LABEL[doc.type],
              doc.size ? formatFileSize(doc.size) : doc.link ? "Drive link" : null,
              doc.uploadedBySelf ? "their upload" : null,
              canManage && doc.visibility !== "PERSON_HR" ? VISIBILITY_LABEL[doc.visibility].toLowerCase() : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {doc.note ? <p className="mt-0.5 text-[12px] text-[var(--text-3)]">{doc.note}</p> : null}
        </div>
        {/* Not shrink-0: on a phone the actions wrap under the title rather than run off the card. */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {doc.expiresOn ? (
            <span
              className={cn(
                "font-mono text-[12px]",
                att === "passed" ? "text-[var(--danger-500)]" : att === "soon" ? "text-[var(--warning-500)]" : "text-[var(--text-3)]",
              )}
            >
              Expires {formatDate(doc.expiresOn)}
            </span>
          ) : null}
          {doc.hasFile ? (
            <a
              href={`/api/staff/documents/${encodeURIComponent(doc.id)}/file`}
              className="app-button app-button-tertiary app-button-xs"
              aria-label={`Download ${doc.title}`}
            >
              <ArrowDownTrayIcon aria-hidden className="h-3.5 w-3.5" />
              Open
            </a>
          ) : doc.link ? (
            <a href={doc.link} target="_blank" rel="noreferrer noopener" className="app-button app-button-tertiary app-button-xs">
              <ArrowTopRightOnSquareIcon aria-hidden className="h-3.5 w-3.5" />
              Open in Drive
            </a>
          ) : null}
          {canManage && doc.status === "TO_CHECK" ? (
            <>
              <button type="button" className="app-button app-button-secondary app-button-xs" disabled={busy} onClick={() => update.mutate({ id: doc.id, review: "accept" })}>
                Accept
              </button>
              <button type="button" className="app-button app-button-tertiary app-button-xs" disabled={busy} onClick={() => setRejecting(true)}>
                Send back
              </button>
            </>
          ) : null}
          {canManage ? (
            confirmDelete ? (
              <>
                <button type="button" className="app-button app-button-danger app-button-xs" disabled={busy} onClick={() => remove.mutate(doc.id)}>
                  Delete
                </button>
                <button type="button" className="app-button app-button-tertiary app-button-xs" onClick={() => setConfirmDelete(false)}>
                  Keep
                </button>
              </>
            ) : (
              <button
                type="button"
                className="app-button app-button-tertiary app-button-xs text-[var(--text-3)] hover:text-[var(--danger-500)]"
                onClick={() => setConfirmDelete(true)}
                aria-label={`Delete ${doc.title}`}
              >
                Delete
              </button>
            )
          ) : null}
        </div>
      </div>
      {rejecting ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            className="app-input min-w-[200px] flex-1"
            placeholder="What's wrong with it? They'll see this."
            value={rejectNote}
            maxLength={300}
            onChange={(e) => setRejectNote(e.target.value)}
            aria-label="Why it's being sent back"
          />
          <button
            type="button"
            className="app-button app-button-secondary app-button-xs"
            disabled={busy}
            onClick={() => update.mutate({ id: doc.id, review: "reject", note: rejectNote.trim() || null }, { onSuccess: () => setRejecting(false) })}
          >
            Send back
          </button>
          <button type="button" className="app-button app-button-tertiary app-button-xs" onClick={() => setRejecting(false)}>
            Cancel
          </button>
        </div>
      ) : null}
      {doc.drive?.state === "failed" ? (
        <p className="mt-1 text-[12px] text-[var(--danger-500)]">
          Not copied to Drive{doc.drive.error ? `: ${doc.drive.error.replace(/\.\s*$/, "")}` : ""}.{" "}
          <button type="button" className="underline" onClick={() => retry.mutate(doc.id)} disabled={retry.isPending}>
            {retry.isPending ? "Retrying…" : "Retry"}
          </button>
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-1 text-[12px] text-[var(--danger-500)]">
          {error instanceof Error ? error.message : "Something went wrong"}
        </p>
      ) : null}
    </li>
  );
}

function AddDocument({
  recordId,
  types,
  canManage,
  initialType,
  onDone,
}: {
  recordId: string;
  types: StaffDocumentType[];
  canManage: boolean;
  initialType?: StaffDocumentType;
  onDone: () => void;
}) {
  const [type, setType] = useState<StaffDocumentType>(initialType && types.includes(initialType) ? initialType : types[0]);
  const [expiresOn, setExpiresOn] = useState("");
  const [visibility, setVisibility] = useState<DocumentVisibility>("PERSON_HR");
  const [mode, setMode] = useState<"file" | "link">("file");
  const [link, setLink] = useState("");
  const refresh = useDocumentsInvalidate(recordId);
  const attach = useLinkDocument(recordId);

  const form = (file: File) => {
    const fd = new FormData();
    fd.set("file", file);
    fd.set("type", type);
    // "Other" is named after its file; every other type is named after the type.
    fd.set("title", type === "OTHER" ? file.name.replace(/\.[^.]+$/, "") : "");
    if (expiresOn) fd.set("expiresOn", expiresOn);
    if (canManage) fd.set("visibility", visibility);
    return fd;
  };

  return (
    <div className="space-y-3 rounded-[10px] border border-[var(--border-2)] p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          What is it?
          <select className="app-select mt-1 w-full" value={type} onChange={(e) => setType(e.target.value as StaffDocumentType)}>
            {types.map((t) => (
              <option key={t} value={t}>
                {STAFF_DOCUMENT_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        {EXPIRING_TYPES.includes(type) ? (
          <label className={label}>
            Expires
            <DatePicker className="mt-1 w-full" value={expiresOn} onChange={setExpiresOn} />
          </label>
        ) : canManage ? (
          <label className={label}>
            Who can see it
            <select className="app-select mt-1 w-full" value={visibility} onChange={(e) => setVisibility(e.target.value as DocumentVisibility)}>
              {DOCUMENT_VISIBILITIES.map((v) => (
                <option key={v} value={v}>
                  {VISIBILITY_LABEL[v]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {mode === "file" ? (
        <AnimatedFileUpload
          variant="compact"
          multiple={false}
          accept={LAUNCHPAD_FILE_ACCEPT}
          maxSize={LAUNCHPAD_FILE_MAX_BYTES}
          dropTitle={`Drop the ${STAFF_DOCUMENT_LABEL[type].toLowerCase()} here`}
          dropSubtitle="or browse: PDF, image, Word, Excel or text"
          removeCompletedAfterMs={1200}
          uploadHandler={async (item, onProgress) => {
            if (!item.rawFile) throw new Error("The file could not be read");
            await uploadWithProgress(`/api/staff/${encodeURIComponent(recordId)}/documents`, form(item.rawFile), onProgress);
          }}
          onUploadComplete={() => {
            refresh();
            setTimeout(onDone, 1200);
          }}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <input
            className="app-input min-w-[220px] flex-1"
            placeholder="https://drive.google.com/…"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            aria-label="Google Drive link"
          />
          <button
            type="button"
            className="app-button app-button-primary app-button-sm"
            disabled={!link.trim() || attach.isPending}
            onClick={() =>
              attach.mutate(
                { type, link: link.trim(), expiresOn: expiresOn || null, visibility },
                { onSuccess: onDone },
              )
            }
          >
            {attach.isPending ? "Attaching…" : "Attach"}
          </button>
        </div>
      )}
      {attach.error ? (
        <p role="alert" className="text-[12px] text-[var(--danger-500)]">
          {attach.error instanceof Error ? attach.error.message : "Could not attach"}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
        {canManage ? (
          <button type="button" className="inline-flex items-center gap-1 text-[var(--text-3)] hover:text-[var(--text-1)] hover:underline" onClick={() => setMode(mode === "file" ? "link" : "file")}>
            <LinkIcon aria-hidden className="h-3.5 w-3.5" />
            {mode === "file" ? "It's already in Google Drive" : "Upload a file instead"}
          </button>
        ) : (
          <span className="text-[var(--text-4)]">HR checks it before it counts as on file.</span>
        )}
        <button type="button" className="text-[var(--text-3)] hover:text-[var(--text-1)] hover:underline" onClick={onDone}>
          Close
        </button>
      </div>
    </div>
  );
}

export function DocumentsCard({ recordId, number, className }: { recordId: string; number: string; className?: string }) {
  const docs = useStaffDocuments(recordId);
  const [adding, setAdding] = useState<StaffDocumentType | "any" | null>(null);
  const request = useRequestDocument(recordId);
  const data = docs.data;
  const done = data?.required.filter((r) => r.state === "on-file" || r.state === "expiring").length ?? 0;
  const canAdd = Boolean(data?.uploadTypes.length);
  // Requests show in the required list (or below it) as an action, not as a file.
  const files = data?.documents.filter((d) => d.status !== "REQUESTED") ?? [];
  const extraRequests = data?.documents.filter((d) => d.status === "REQUESTED" && !data.required.some((r) => r.type === d.type)) ?? [];

  return (
    <WidgetCard
      number={number}
      name="Documents"
      className={className}
      status={data?.required.length ? `${done} of ${data.required.length} required` : undefined}
      statusTone={data && data.required.length && done === data.required.length ? "success" : "muted"}
      action={canAdd && adding === null ? <HeaderAction onClick={() => setAdding("any")} label="Add a document">Add</HeaderAction> : undefined}
    >
      {docs.isPending ? (
        <p className="text-[13px] text-[var(--text-3)]">Loading…</p>
      ) : docs.isError || !data ? (
        <p role="alert" className="text-[13px] text-[var(--danger-500)]">
          {docs.error instanceof Error ? docs.error.message : "Could not load documents"}
        </p>
      ) : (
        <div className="space-y-4">
          {adding !== null ? (
            <AddDocument
              key={adding}
              recordId={recordId}
              types={data.uploadTypes}
              canManage={data.canManage}
              initialType={adding === "any" ? undefined : adding}
              onDone={() => setAdding(null)}
            />
          ) : null}

          {data.required.length ? (
            <div>
              <p className="widget-data-label text-[var(--text-4)]">Required</p>
              <ul className="mt-1 divide-y divide-[var(--border-3)]">
                {data.required.map((r) => (
                  <li key={r.type} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
                    <span className="text-[var(--text-1)]">{STAFF_DOCUMENT_LABEL[r.type]}</span>
                    <span className="flex items-center gap-3">
                      <span className={cn(chip, STATE_TONE[r.state])}>{REQUIREMENT_LABEL[r.state]}</span>
                      {(r.state === "missing" || r.state === "expired" || r.state === "rejected" || r.state === "requested") &&
                      data.uploadTypes.includes(r.type) ? (
                        <button type="button" className="app-button app-button-tertiary app-button-xs" onClick={() => setAdding(r.type)}>
                          Add
                        </button>
                      ) : null}
                      {data.canManage && (r.state === "missing" || r.state === "expired" || r.state === "rejected") ? (
                        <button
                          type="button"
                          className="app-button app-button-tertiary app-button-xs"
                          disabled={request.isPending}
                          onClick={() => request.mutate({ type: r.type })}
                          title="Ask them for it. It shows on their Backstage → Me page."
                        >
                          Ask for it
                        </button>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {extraRequests.length ? (
            <div>
              <p className="widget-data-label text-[var(--text-4)]">Asked for</p>
              <ul className="mt-1 divide-y divide-[var(--border-3)]">
                {extraRequests.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
                    <span className="text-[var(--text-1)]">
                      {d.title}
                      {d.note ? <span className="text-[var(--text-3)]"> · {d.note}</span> : null}
                    </span>
                    {data.uploadTypes.includes(d.type) ? (
                      <button type="button" className="app-button app-button-tertiary app-button-xs" onClick={() => setAdding(d.type)}>
                        Add
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            {data.required.length || extraRequests.length ? <p className="widget-data-label text-[var(--text-4)]">On file</p> : null}
            {files.length ? (
              <ul className="divide-y divide-[var(--border-3)]">
                {files.map((d) => (
                  <DocumentRow key={d.id} doc={d} recordId={recordId} canManage={data.canManage} />
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[13px] text-[var(--text-3)]">Nothing on file yet.</p>
            )}
          </div>
          {request.error ? (
            <p role="alert" className="text-[12px] text-[var(--danger-500)]">
              {request.error instanceof Error ? request.error.message : "Could not ask for it"}
            </p>
          ) : null}
        </div>
      )}
    </WidgetCard>
  );
}
