"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { buttonStyles } from "@/components/ui/button-styles";

export function PrintToolbar({ proposalId }: { proposalId: string }) {
  return (
    <header className="app-card flex items-center justify-between p-4 print:hidden">
      <div>
        <p className="app-eyebrow">Print View</p>
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
          href={`/app/docs/${proposalId}`}
          className={buttonStyles({ variant: "secondary", size: "sm" })}
        >
          Back to editor
        </Link>
      </div>
    </header>
  );
}
