'use client';

/**
 * Animated File Upload — vendored from EasyUI.
 *
 * Source:  https://github.com/Surajmaurya1/easyui — `src/components/ui/AnimatedFileUpload.tsx`
 *          (spring values from `src/lib/motion-tokens.ts`, `springSnappy` and `springGentle`)
 * Docs:    https://easyui.site/components/animated-file-upload
 * Licence: MIT, Copyright (c) 2026 Suraj Maurya — full text in docs/third-party-ui.md.
 *
 * The drop zone, the lift on drag-over, the file rows with their type icons, the status
 * line and the progress bar along the bottom of each row are EasyUI's. What was changed for
 * Foundry, and only this:
 *
 *  - Imports: `cn` from `@/lib/format`; icons from Heroicons mapped one-for-one (lucide is
 *    not a dependency here); the two spring tokens inlined.
 *  - Colours: EasyUI is dark-only. Every hex is mapped to a Foundry token so it works in
 *    light AND dark: surface-0/1/2, border-1/2, text-1/3/4, the progress bar to brand, and
 *    the rose / emerald states to danger / success.
 *  - `uploadHandler` is required. Upstream falls back to a simulated upload with a random
 *    timer, which in a real product would show "Ready" for a file that never left the page.
 *  - `removeCompletedAfterMs`: a finished row can leave the list on its own, for callers that
 *    show the uploaded file elsewhere (a document list), so it isn't listed twice.
 *  - `onFileRemoved`: tells a caller that only PICKS a file (sent later, on submit) that the
 *    person took it back out.
 *  - Accessibility: the drop zone has an accessible name, the row list is a polite live
 *    region, and the file name carries a `title` so a truncated name is recoverable.
 *  - prefers-reduced-motion: no lift, scale or slide; the progress bar still moves, because
 *    it carries information.
 */

import React, { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion, type Transition } from 'framer-motion';
import {
  ArrowUpTrayIcon,
  DocumentIcon,
  CheckIcon,
  ExclamationCircleIcon,
  XMarkIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  PhotoIcon,
  FilmIcon,
  MusicalNoteIcon,
  ArchiveBoxIcon,
  CodeBracketIcon,
} from '@heroicons/react/24/outline';
import { cn } from '@/lib/format';
import { viewAsHeaders } from '@/lib/api';

/** EasyUI's springSnappy and springGentle (src/lib/motion-tokens.ts). */
const springSnappy: Transition = { type: 'spring', stiffness: 380, damping: 30, mass: 0.5 };
const springGentle: Transition = { type: 'spring', stiffness: 170, damping: 26, mass: 0.9 };
const instant: Transition = { duration: 0 };

export type FileUploadStatus = 'queued' | 'uploading' | 'processing' | 'complete' | 'error';

export interface UploadFileItem {
  id: string;
  name: string;
  size: number;
  type: string;
  progress: number;
  status: FileUploadStatus;
  errorMessage?: string;
  rawFile?: File;
}

export interface AnimatedFileUploadProps {
  /** Allow multiple files selection and upload */
  multiple?: boolean;
  /** Accepted MIME types or extensions (e.g., "image/*,application/pdf" or [".png", ".jpg"]) */
  accept?: string | string[];
  /** Maximum file size in bytes (e.g., 10 * 1024 * 1024 for 10MB) */
  maxSize?: number;
  /** Maximum number of files allowed when multiple is true */
  maxFiles?: number;
  /** Custom label for primary drop title */
  dropTitle?: string;
  /** Custom label for secondary browse action */
  dropSubtitle?: string;
  /** Layout mode: standard full-size or compact inline */
  variant?: 'standard' | 'compact';
  /** Disabled state */
  disabled?: boolean;
  /** Initial files list for controlled or default showcase */
  initialFiles?: UploadFileItem[];
  /** Callback fired when files are dropped or selected */
  onFilesSelected?: (files: File[]) => void;
  /** Callback fired when a file upload completes */
  onUploadComplete?: (file: UploadFileItem) => void;
  /** Uploads one file, reporting progress 0–100. Rejecting shows its message on the row. */
  uploadHandler: (file: UploadFileItem, onProgress: (progress: number) => void) => Promise<void>;
  /** Foundry: take a finished row out of the list after this long. */
  removeCompletedAfterMs?: number;
  /** Foundry: a row was removed with its ✕. */
  onFileRemoved?: (file: UploadFileItem) => void;
  /** Custom class name */
  className?: string;
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const getFileIcon = (fileName: string, mimeType: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (mimeType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'svg', 'webp', 'gif'].includes(ext)) return PhotoIcon;
  if (mimeType.startsWith('video/') || ['mp4', 'mov', 'webm', 'mkv'].includes(ext)) return FilmIcon;
  if (mimeType.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac'].includes(ext)) return MusicalNoteIcon;
  if (['zip', 'rar', 'tar', 'gz', '7z'].includes(ext)) return ArchiveBoxIcon;
  if (['ts', 'tsx', 'js', 'jsx', 'json', 'html', 'css', 'py', 'rs', 'go'].includes(ext)) return CodeBracketIcon;
  if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) return DocumentTextIcon;
  return DocumentIcon;
};

export const AnimatedFileUpload: React.FC<AnimatedFileUploadProps> = ({
  multiple = true,
  accept,
  maxSize = 25 * 1024 * 1024,
  maxFiles = 10,
  dropTitle = 'Drop files here',
  dropSubtitle = 'or browse from your device',
  variant = 'standard',
  disabled = false,
  initialFiles,
  onFilesSelected,
  onUploadComplete,
  uploadHandler,
  removeCompletedAfterMs,
  onFileRemoved,
  className,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [files, setFiles] = useState<UploadFileItem[]>(initialFiles || []);
  const inputRef = useRef<HTMLInputElement>(null);
  const reduced = useReducedMotion();

  const acceptString = Array.isArray(accept) ? accept.join(',') : accept;

  const run = useCallback(
    (fileItem: UploadFileItem) => {
      uploadHandler(fileItem, (progress) => {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileItem.id ? { ...f, progress, status: progress >= 100 ? 'processing' : 'uploading' } : f,
          ),
        );
      })
        .then(() => {
          setFiles((prev) => prev.map((f) => (f.id === fileItem.id ? { ...f, progress: 100, status: 'complete' } : f)));
          onUploadComplete?.(fileItem);
          if (removeCompletedAfterMs !== undefined) {
            setTimeout(() => setFiles((prev) => prev.filter((f) => f.id !== fileItem.id)), removeCompletedAfterMs);
          }
        })
        .catch((err) => {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileItem.id ? { ...f, status: 'error', errorMessage: err?.message || 'Upload failed' } : f,
            ),
          );
        });
    },
    [uploadHandler, onUploadComplete, removeCompletedAfterMs],
  );

  const processIncomingFiles = useCallback(
    (incoming: File[]) => {
      if (disabled) return;
      const validFiles: UploadFileItem[] = incoming.map((file) => {
        const id = `${file.name}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const isOverSize = maxSize && file.size > maxSize;
        return isOverSize
          ? {
              id,
              name: file.name,
              size: file.size,
              type: file.type,
              progress: 0,
              status: 'error',
              errorMessage: `File exceeds maximum allowed size (${formatFileSize(maxSize)})`,
              rawFile: file,
            }
          : { id, name: file.name, size: file.size, type: file.type, progress: 0, status: 'uploading', rawFile: file };
      });

      setFiles((prev) => {
        const combined = multiple ? [...validFiles, ...prev] : validFiles;
        return combined.slice(0, maxFiles);
      });
      onFilesSelected?.(incoming);
      validFiles.forEach((fileItem) => {
        if (fileItem.status !== 'error') run(fileItem);
      });
    },
    [disabled, maxSize, multiple, maxFiles, onFilesSelected, run],
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      processIncomingFiles(multiple ? droppedFiles : [droppedFiles[0]]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = Array.from(e.target.files);
      processIncomingFiles(multiple ? selected : [selected[0]]);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemoveFile = (id: string) => {
    const removed = files.find((f) => f.id === id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
    if (removed) onFileRemoved?.(removed);
  };

  const handleRetryFile = (fileItem: UploadFileItem) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === fileItem.id ? { ...f, progress: 0, status: 'uploading', errorMessage: undefined } : f)),
    );
    run(fileItem);
  };

  const isCompact = variant === 'compact';

  return (
    <div className={cn('w-full font-sans', className)}>
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={acceptString}
        onChange={handleFileInputChange}
        disabled={disabled}
        className="hidden"
        aria-label="Upload files"
      />

      {/* Drop Zone Box */}
      <motion.div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        tabIndex={disabled ? -1 : 0}
        role="button"
        aria-label={`${dropTitle}, ${dropSubtitle}`}
        aria-disabled={disabled}
        animate={reduced ? undefined : { scale: isDragOver ? 1.01 : 1 }}
        transition={reduced ? instant : springSnappy}
        className={cn(
          'relative flex cursor-pointer select-none flex-col items-center justify-center rounded-xl border border-dashed text-center transition-colors',
          isDragOver
            ? 'border-[var(--brand-600)] bg-[var(--surface-2)]'
            : 'border-[var(--border-2)] bg-[var(--surface-1)] hover:border-[var(--border-1)]',
          isCompact ? 'min-h-[120px] p-5 sm:p-6' : 'min-h-[180px] p-8 sm:p-10',
          disabled && 'cursor-not-allowed border-solid opacity-40',
        )}
      >
        <motion.div
          animate={reduced ? undefined : { y: isDragOver ? -3 : 0, scale: isDragOver ? 1.08 : 1 }}
          transition={reduced ? instant : springSnappy}
          className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border-2)] bg-[var(--surface-0)] text-[var(--text-3)]"
        >
          <ArrowUpTrayIcon
            aria-hidden
            className={cn('h-5 w-5 transition-colors', isDragOver ? 'text-[var(--brand-600)]' : 'text-[var(--text-4)]')}
          />
        </motion.div>

        <div className="space-y-1">
          <p className="text-sm font-medium text-[var(--text-1)]">{dropTitle}</p>
          <p className="text-xs text-[var(--text-3)]">
            {dropSubtitle}{' '}
            {maxSize && <span className="text-[var(--text-4)]">(up to {formatFileSize(maxSize)})</span>}
          </p>
        </div>
      </motion.div>

      {/* Uploading / Uploaded Files List */}
      <AnimatePresence mode="popLayout">
        {files.length > 0 && (
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
            transition={reduced ? instant : springGentle}
            className="mt-4 space-y-2"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center justify-between px-1 font-mono text-[11px] uppercase tracking-wider text-[var(--text-4)]">
              <span>Files ({files.length})</span>
              {files.some((f) => f.status === 'complete') && (
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((f) => f.status !== 'complete'))}
                  className="cursor-pointer rounded transition-colors hover:text-[var(--text-2)]"
                >
                  Clear Completed
                </button>
              )}
            </div>

            <div className="space-y-2">
              {files.map((file) => {
                const IconComponent = getFileIcon(file.name, file.type);
                const isComplete = file.status === 'complete';
                const isError = file.status === 'error';
                const isProcessing = file.status === 'processing';
                const isUploading = file.status === 'uploading';

                return (
                  <motion.div
                    key={file.id}
                    layout={!reduced}
                    initial={reduced ? false : { opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                    transition={reduced ? instant : springGentle}
                    className={cn(
                      'relative overflow-hidden rounded-xl border p-3 transition-colors sm:p-3.5',
                      isError
                        ? 'border-[var(--danger-500)] bg-[var(--danger-50)]'
                        : isComplete
                          ? 'border-[var(--success-500)] bg-[var(--success-50)]'
                          : 'border-[var(--border-2)] bg-[var(--surface-0)]',
                    )}
                  >
                    <div className="relative z-10 flex items-center gap-3">
                      {/* File Type Icon */}
                      <div
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                          isError
                            ? 'border-[var(--danger-500)] text-[var(--danger-500)]'
                            : isComplete
                              ? 'border-[var(--success-500)] text-[var(--success-500)]'
                              : 'border-[var(--border-2)] bg-[var(--surface-1)] text-[var(--text-3)]',
                        )}
                      >
                        <IconComponent aria-hidden className="h-4 w-4" />
                      </div>

                      {/* File Metadata */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-medium text-[var(--text-1)]" title={file.name}>
                            {file.name}
                          </p>
                          <span className="shrink-0 font-mono text-[10px] text-[var(--text-4)]">{formatFileSize(file.size)}</span>
                        </div>

                        {/* Status line */}
                        <div className="mt-1 flex items-center justify-between text-[11px]">
                          {isError ? (
                            <span className="flex min-w-0 items-center gap-1 text-[var(--danger-500)]">
                              <ExclamationCircleIcon aria-hidden className="h-3 w-3 shrink-0" />
                              <span className="truncate" title={file.errorMessage}>
                                {file.errorMessage || 'Upload failed'}
                              </span>
                            </span>
                          ) : isComplete ? (
                            <span className="flex items-center gap-1 text-[var(--success-500)]">
                              <CheckIcon aria-hidden className="h-3 w-3 shrink-0" />
                              <span>Ready</span>
                            </span>
                          ) : isProcessing ? (
                            <span className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--text-3)]">
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--brand-600)] motion-reduce:animate-none" />
                              Processing...
                            </span>
                          ) : (
                            <span className="font-mono text-[10px] text-[var(--text-4)]">Uploading {file.progress}%</span>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex shrink-0 items-center gap-1">
                        {isError && (
                          <button
                            type="button"
                            onClick={() => handleRetryFile(file)}
                            className="cursor-pointer rounded-md p-1 text-[var(--text-4)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
                            title="Retry upload"
                            aria-label={`Retry uploading ${file.name}`}
                          >
                            <ArrowPathIcon aria-hidden className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(file.id)}
                          className="cursor-pointer rounded-md p-1 text-[var(--text-4)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
                          title="Remove file"
                          aria-label={`Remove ${file.name}`}
                        >
                          <XMarkIcon aria-hidden className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Progress Bar (at the bottom) */}
                    {(isUploading || isProcessing) && (
                      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--surface-2)]">
                        <motion.div
                          className="h-full bg-[var(--brand-600)]"
                          initial={{ width: '0%' }}
                          animate={{ width: `${file.progress}%` }}
                          transition={{ duration: 0.15, ease: 'easeOut' }}
                        />
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/**
 * Foundry: upload one file with real progress (fetch can't report upload progress), with
 * the "view as" headers every other request sends. Rejects with the server's message.
 * On the demo pages, where `/api` is answered by a patched fetch, it goes through fetch
 * instead and reports progress in two steps.
 */
export function uploadWithProgress(url: string, form: FormData, onProgress: (progress: number) => void): Promise<unknown> {
  const errorOf = (body: unknown, status: number) =>
    body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : `Upload failed (${status})`;
  if (typeof window !== 'undefined' && globalThis.__foundryDemoFetchPatched) {
    onProgress(40);
    return fetch(url, { method: 'POST', body: form }).then(async (res) => {
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorOf(body, res.status));
      onProgress(100);
      return body;
    });
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    for (const [k, v] of Object.entries(viewAsHeaders())) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(errorOf(body, xhr.status)));
    };
    xhr.onerror = () => reject(new Error('Network error: the upload did not reach Foundry'));
    xhr.send(form);
  });
}
