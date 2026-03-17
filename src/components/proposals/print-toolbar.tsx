"use client";

import Link from "next/link";
import { Button, buttonStyles } from "@/components/ui/button";

export function PrintToolbar({ proposalId }: { proposalId: string }) {
  return (
    <header className="flex items-center justify-between rounded-lg border border-[var(--border-1)] bg-white p-3 print:hidden">
      <div>
        <p className="text-xs font-semibold tracking-wide text-[var(--text-3)] uppercase">Print view</p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={() => window.print()}
          variant="primary"
          size="sm"
        >
          Print / Save PDF
        </Button>
        <Link
          href={`/app/proposals/${proposalId}`}
          className={buttonStyles({ variant: "secondary", size: "sm" })}
        >
          Back to editor
        </Link>
      </div>
    </header>
  );
}
