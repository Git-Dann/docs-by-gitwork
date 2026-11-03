"use client";

import { useState } from "react";
import imageCompression from "browser-image-compression";
import { TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { AnimatedFileUpload } from "@/components/ui/easyui/animated-file-upload";
import { useUploadTaskAttachment, useDeleteTaskAttachment } from "@/hooks/use-tasks";
import type { TaskAttachmentDTO } from "@/types/tasks";

const COMPRESSION_OPTS: Parameters<typeof imageCompression>[1] = {
  maxSizeMB: 1.5,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  initialQuality: 0.9,
};

/**
 * Screenshots/images attached directly to a task: EasyUI's Animated File Upload (drop a
 * screenshot straight onto the task), a thumbnail grid and a lightbox.
 */
export function TaskAttachments({
  taskId,
  attachments,
}: {
  taskId: string;
  attachments: TaskAttachmentDTO[];
}) {
  const upload = useUploadTaskAttachment();
  const del = useDeleteTaskAttachment();
  const [viewing, setViewing] = useState<TaskAttachmentDTO | null>(null);

  async function send(file: File, onProgress: (p: number) => void) {
    onProgress(20);
    // HEIC/HEIF can't be compressed in-browser reliably — send as-is; the server transcodes it.
    const toUpload = file.type.startsWith("image/heic") || file.type.startsWith("image/heif")
      ? file
      : await imageCompression(file, { ...COMPRESSION_OPTS, onProgress: (p) => onProgress(20 + Math.round(p * 0.5)) });
    onProgress(80);
    await upload.mutateAsync({ taskId, file: toUpload });
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
      </div>

      {attachments.length === 0 ? null : (
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

      <AnimatedFileUpload
        className={attachments.length ? "mt-2" : undefined}
        variant="compact"
        // Listed rather than a wildcard: iPhone HEIC included (the server transcodes it).
        accept=".png,.jpg,.jpeg,.webp,.gif,.heic,.heif"
        maxSize={25 * 1024 * 1024}
        maxFiles={5}
        dropTitle="Drop screenshots here"
        dropSubtitle="or browse for an image"
        removeCompletedAfterMs={1200}
        uploadHandler={async (item, onProgress) => {
          if (!item.rawFile) throw new Error("The image could not be read");
          await send(item.rawFile, onProgress);
        }}
      />

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
