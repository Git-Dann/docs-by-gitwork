"use client";

import { useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import { PhotoIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useUploadTaskAttachment, useDeleteTaskAttachment } from "@/hooks/use-tasks";
import type { TaskAttachmentDTO } from "@/types/tasks";

const COMPRESSION_OPTS: Parameters<typeof imageCompression>[1] = {
  maxSizeMB: 1.5,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  initialQuality: 0.9,
};

/** Screenshots/images attached directly to a task — upload, thumbnail grid, lightbox. */
export function TaskAttachments({
  taskId,
  attachments,
}: {
  taskId: string;
  attachments: TaskAttachmentDTO[];
}) {
  const upload = useUploadTaskAttachment();
  const del = useDeleteTaskAttachment();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<TaskAttachmentDTO | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      // HEIC/HEIF can't be compressed in-browser reliably — send as-is; the server transcodes it.
      const toUpload = file.type.startsWith("image/heic") || file.type.startsWith("image/heif")
        ? file
        : await imageCompression(file, COMPRESSION_OPTS);
      await upload.mutateAsync({ taskId, file: toUpload });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to attach image");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(attachmentId: string) {
    setViewing(null);
    await del.mutateAsync({ taskId, attachmentId });
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="app-eyebrow">
          Attachments {attachments.length > 0 ? `· ${attachments.length}` : ""}
        </p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--brand-700)] transition hover:text-[var(--brand-800)] disabled:opacity-50"
        >
          <PhotoIcon className="h-3.5 w-3.5" />
          {uploading ? "Uploading…" : "Add image"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {error ? <p className="mb-2 text-xs text-[var(--danger-500)]">{error}</p> : null}

      {attachments.length === 0 ? (
        <p className="text-xs text-[var(--text-4)]">No images attached.</p>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {attachments.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setViewing(a)}
              className="group relative aspect-square overflow-hidden rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/tasks/${taskId}/attachments/${a.id}?thumb=1`}
                alt={a.filename ?? "Attachment"}
                className="h-full w-full object-cover transition group-hover:opacity-90"
              />
            </button>
          ))}
        </div>
      )}

      {viewing ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setViewing(null)}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-2xl overflow-auto rounded-[10px] bg-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border-2)] px-4 py-2.5">
              <p className="truncate text-xs text-[var(--text-3)]">{viewing.filename ?? "Attachment"}</p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void handleDelete(viewing.id)}
                  disabled={del.isPending}
                  aria-label="Delete attachment"
                  className="rounded-[6px] p-1.5 text-[var(--text-3)] transition hover:bg-[var(--surface-1)] hover:text-[var(--danger-500)] disabled:opacity-50"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewing(null)}
                  aria-label="Close"
                  className="rounded-[6px] p-1.5 text-[var(--text-3)] transition hover:bg-[var(--surface-1)]"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="bg-[var(--surface-1)] p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/tasks/${taskId}/attachments/${viewing.id}`}
                alt={viewing.filename ?? "Attachment"}
                className="mx-auto max-h-[70vh] w-auto rounded-[6px] border border-[var(--border-2)] bg-white"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
