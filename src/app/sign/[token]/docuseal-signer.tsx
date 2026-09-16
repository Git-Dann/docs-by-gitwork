"use client";

import dynamic from "next/dynamic";

const DocusealForm = dynamic(
  () => import("@docuseal/react").then((mod) => mod.DocusealForm),
  { ssr: false }
);

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
        withTitle={false}
        customCss={`
          .header-container,
          .title-container,
          .company-logo,
          .template-title,
          .template-name,
          .start-form-header,
          .submitted-form-company-logo,
          .form-header,
          header {
            display: none !important;
          }
          .main-container,
          .form-container,
          .page-container:first-child {
            padding-top: 0 !important;
            margin-top: 0 !important;
          }
        `}
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
