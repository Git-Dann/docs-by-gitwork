"use client";

import { DocusealForm } from "@docuseal/react";

interface DocuSealSignerProps {
  src: string;
  email?: string;
  name?: string;
  token?: string;
}

export function DocuSealSigner({ src, email, name, token }: DocuSealSignerProps) {
  return (
    <div className="w-full rounded-[12px] border border-[var(--border-2)] bg-white overflow-hidden shadow-lg min-h-[680px]">
      <DocusealForm
        src={src}
        email={email}
        name={name}
        className="w-full min-h-[720px]"
        onComplete={async () => {
          if (token) {
            try {
              await fetch(`/api/sign/${token}/sign`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  method: "DRAWN",
                  payload: "DocuSeal Embedded Signature",
                  signedName: name || "Authorised Signatory",
                }),
              });
            } catch (err) {
              console.error("[DocuSealSigner] Direct completion sync failed:", err);
            }
          }
          window.location.reload();
        }}
      />
    </div>
  );
}
