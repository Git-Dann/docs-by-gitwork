"use client";

import { useCallback, useState } from "react";

/**
 * Minimal, self-contained toast for the DevSignal UI. Deliberately does NOT
 * depend on the app-wide toast provider so DevSignal stays isolated. Click to
 * dismiss; shows the latest message bottom-right.
 */
export function useNotice() {
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const showOk = useCallback(
    (title: string, desc?: string) => setNotice({ kind: "ok", text: desc ? `${title} — ${desc}` : title }),
    [],
  );
  const showErr = useCallback(
    (title: string, desc?: string) => setNotice({ kind: "err", text: desc ? `${title}: ${desc}` : title }),
    [],
  );

  const noticeEl = notice ? (
    <div
      role="status"
      onClick={() => setNotice(null)}
      className={`fixed bottom-4 right-4 z-50 max-w-sm cursor-pointer rounded-lg px-4 py-3 text-sm shadow-lg ${
        notice.kind === "ok" ? "bg-green-600 text-white" : "bg-red-600 text-white"
      }`}
    >
      {notice.text}
    </div>
  ) : null;

  return { showOk, showErr, noticeEl };
}
