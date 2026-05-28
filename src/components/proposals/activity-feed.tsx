/**
 * Recent activity feed for a document (Sprint 5+6).
 *
 * Lives below SignaturePanel in the editor. Reads from /api/documents/[id]/activity which
 * merges DocumentView (public link visits + /sign/[token] visits) with SignatureEvent rows
 * (sent, signed, declined, completed) into one newest-first timeline.
 *
 * Top of the widget surfaces an aggregate view count + last-viewed-at so the operator can see
 * at a glance how much traction the share link is getting.
 */

"use client";

import { useEffect, useState } from "react";
import { EyeIcon, PaperAirplaneIcon, PencilSquareIcon, ShieldCheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { apiFetch } from "@/lib/api";

type FeedItem =
  | {
      kind: "VIEW";
      id: string;
      createdAt: string;
      origin: string;
      signerName: string | null;
      signerRole: string | null;
      ip: string | null;
    }
  | {
      kind: "SIGNATURE_EVENT";
      id: string;
      createdAt: string;
      eventKind: string;
      signerName: string | null;
      signerRole: string | null;
      ip: string | null;
      metadata: unknown;
    };

interface ActivityResponse {
  activity: FeedItem[];
  summary: { totalViews: number; lastViewedAt: string | null };
}

export function ActivityFeed({ documentId }: { documentId: string }) {
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await apiFetch<ActivityResponse>(`/api/documents/${documentId}/activity`);
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    }
    void load();
    // Poll every 30s so the feed updates as signatures land. Cheap query (50-row cap each side).
    const interval = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [documentId]);

  return (
    <section className="widget-card overflow-hidden">
      <div className="widget-header">
        <span className="widget-header-label">RECENT ACTIVITY</span>
        <span className="widget-header-right">
          {data ? `${data.summary.totalViews} VIEW${data.summary.totalViews === 1 ? "" : "S"}` : "…"}
        </span>
      </div>

      <div className="p-5 sm:p-6">
        {error ? (
          <p className="text-sm font-medium text-[var(--danger-500)]">{error}</p>
        ) : null}

        {data && data.activity.length === 0 ? (
          <p className="text-sm text-[var(--text-3)]">
            No activity yet. Once you share the public link or send for signature, every view
            and every signing event will appear here.
          </p>
        ) : null}

        {data && data.activity.length > 0 ? (
          <ul className="space-y-3">
            {data.activity.slice(0, 12).map((item) => (
              <li key={item.id} className="flex items-start gap-3">
                <FeedIcon item={item} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--text-1)]">
                    {feedTitle(item)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--text-4)]">
                    {new Date(item.createdAt).toLocaleString()}
                    {item.ip ? ` · ${item.ip}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

function FeedIcon({ item }: { item: FeedItem }) {
  if (item.kind === "VIEW") {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-1)] text-[var(--text-3)]">
        <EyeIcon className="h-3.5 w-3.5" />
      </div>
    );
  }
  // Pick an icon per signature event kind
  const kind = item.eventKind;
  const Icon =
    kind === "SIGNER_SIGNED"
      ? ShieldCheckIcon
      : kind === "SIGNER_DECLINED"
        ? XMarkIcon
        : kind === "REQUEST_SENT" || kind === "SIGNER_INVITED"
          ? PaperAirplaneIcon
          : PencilSquareIcon;
  const tone =
    kind === "SIGNER_SIGNED"
      ? "bg-[var(--success-50)] text-[var(--success-500)]"
      : kind === "SIGNER_DECLINED" || kind === "REQUEST_REVOKED"
        ? "bg-[var(--danger-50)] text-[var(--danger-500)]"
        : "bg-[var(--brand-200)] text-[var(--brand-700)]";
  return (
    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${tone}`}>
      <Icon className="h-3.5 w-3.5" />
    </div>
  );
}

function feedTitle(item: FeedItem): string {
  if (item.kind === "VIEW") {
    if (item.signerName) {
      return `${item.signerName} viewed the document${item.signerRole ? ` (${item.signerRole})` : ""}`;
    }
    return item.origin === "SIGN"
      ? "A signer viewed the signing page"
      : "Someone viewed the public share link";
  }
  const subject = item.signerName ?? "Workspace";
  switch (item.eventKind) {
    case "REQUEST_CREATED":
      return "Signature request created";
    case "REQUEST_SENT":
      return "Sent for signature";
    case "REQUEST_REVOKED":
      return "Signature request revoked";
    case "REQUEST_COMPLETED":
      return "All signers signed — document complete";
    case "REQUEST_EXPIRED":
      return "Signature request expired";
    case "SIGNER_INVITED":
      return `${subject} invited to sign`;
    case "SIGNER_VIEWED":
      return `${subject} opened the signing page`;
    case "SIGNER_SIGNED":
      return `${subject} signed`;
    case "SIGNER_DECLINED":
      return `${subject} declined`;
    default:
      return item.eventKind;
  }
}
