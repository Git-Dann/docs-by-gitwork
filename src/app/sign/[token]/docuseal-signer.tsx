"use client";

import { DocusealForm } from "@docuseal/react";

interface DocuSealSignerProps {
  src: string;
  email?: string;
  name?: string;
}

export function DocuSealSigner({ src, email, name }: DocuSealSignerProps) {
  return (
    <div className="w-full rounded-[12px] border border-[var(--border-2)] bg-white overflow-hidden shadow-lg min-h-[680px]">
      <DocusealForm
        src={src}
        email={email}
        name={name}
        className="w-full min-h-[720px]"
        onComplete={() => {
          window.location.reload();
        }}
      />
    </div>
  );
}
