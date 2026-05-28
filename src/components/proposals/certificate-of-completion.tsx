/**
 * Certificate of Completion appendix (Sprint 4).
 *
 * Appended to the printable view of a document when a SignatureRequest reached COMPLETED.
 * It serves as the legal audit trail: parties, signing methods, IP / UA captures, full event
 * timeline. Designed to print on its own page (page-break-before: always).
 *
 * Lives next to the rest of the proposal components so the print page can compose it without
 * any extra plumbing.
 */

import type {
  SignatureRequestRecord,
  SignerStatus,
} from "@/hooks/use-signatures";

const KIND_LABEL: Record<string, string> = {
  REQUEST_CREATED: "Request created",
  REQUEST_SENT: "Request sent",
  REQUEST_REVOKED: "Request revoked",
  REQUEST_EXPIRED: "Request expired",
  REQUEST_COMPLETED: "Request completed",
  SIGNER_INVITED: "Signer invited",
  SIGNER_VIEWED: "Signer viewed document",
  SIGNER_SIGNED: "Signer signed",
  SIGNER_DECLINED: "Signer declined",
};

const SIGNER_STATUS_TEXT: Record<SignerStatus, string> = {
  PENDING: "Pending",
  VIEWED: "Viewed",
  SIGNED: "Signed",
  DECLINED: "Declined",
};

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return iso ?? "—";
  }
}

export function CertificateOfCompletion({
  request,
  documentTitle,
  documentNumber,
}: {
  request: SignatureRequestRecord;
  documentTitle: string;
  documentNumber: string | null;
}) {
  const events = request.events ?? [];

  return (
    <section
      className="proposal-block-avoid certificate-of-completion"
      style={{
        breakBefore: "page",
        pageBreakBefore: "always",
        background: "white",
        padding: "48px 52px",
        borderTop: "1px solid rgba(0,0,0,0.08)",
      }}
    >
      {/* Header */}
      <header style={{ marginBottom: 28 }}>
        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-mono), monospace",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#9CA3AF",
          }}
        >
          Appendix · Certificate of Completion
        </p>
        <h2
          style={{
            margin: "12px 0 4px",
            fontFamily: "var(--font-display), serif",
            fontSize: 36,
            fontWeight: 400,
            letterSpacing: "-0.025em",
            lineHeight: 1.1,
            color: "#0F172A",
          }}
        >
          Audit record
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: "#475569" }}>
          {documentNumber ? `${documentNumber} · ` : ""}
          {documentTitle}
        </p>
      </header>

      {/* Request summary */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 0,
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 10,
          overflow: "hidden",
          marginBottom: 28,
        }}
      >
        <SummaryCell label="Request ID" value={request.id.slice(0, 12)} mono />
        <SummaryCell label="Sent" value={formatDateTime(request.sentAt)} />
        <SummaryCell label="Completed" value={formatDateTime(request.completedAt)} />
        <SummaryCell label="Signers" value={String(request.signers.length)} mono last />
      </div>

      {/* Signers */}
      <SectionHeading>Signatories</SectionHeading>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 28, fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.12)" }}>
            <Th>Signer</Th>
            <Th>Role</Th>
            <Th>Method</Th>
            <Th>Signed at</Th>
            <Th>IP</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {request.signers.map((signer) => {
            // Look up the SIGNED event for this signer to pull method + IP. We don't include the
            // method/IP on the SignatureSignerRecord type today (deliberately — the editor side
            // doesn't need them), so we extract from the events list.
            const signedEvent = events.find(
              (e) => e.kind === "SIGNER_SIGNED" && e.signerId === signer.id,
            );
            const method = (signedEvent?.metadata as { method?: string } | null)?.method ?? "—";
            return (
              <tr key={signer.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                <Td>
                  <div style={{ fontWeight: 600, color: "#0F172A" }}>{signer.name}</div>
                  <div style={{ fontSize: 11, color: "#94A3B8" }}>{signer.email}</div>
                </Td>
                <Td>{signer.role}</Td>
                <Td>{method}</Td>
                <Td>{formatDateTime(signer.signedAt)}</Td>
                <Td mono>{signedEvent?.ip ?? "—"}</Td>
                <Td strong>
                  {SIGNER_STATUS_TEXT[signer.status]}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Event timeline */}
      <SectionHeading>Event timeline</SectionHeading>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.12)" }}>
            <Th>When</Th>
            <Th>Event</Th>
            <Th>Signer</Th>
            <Th>IP</Th>
            <Th>User agent</Th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => {
            const signer = event.signerId
              ? request.signers.find((s) => s.id === event.signerId)
              : null;
            return (
              <tr key={event.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)", verticalAlign: "top" }}>
                <Td mono>{formatDateTime(event.createdAt)}</Td>
                <Td>{KIND_LABEL[event.kind] ?? event.kind}</Td>
                <Td>{signer ? signer.name : "—"}</Td>
                <Td mono>{event.ip ?? "—"}</Td>
                <Td>
                  <div style={{ fontSize: 10, color: "#64748B", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {event.userAgent ?? "—"}
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Footer */}
      <div
        style={{
          marginTop: 36,
          paddingTop: 16,
          borderTop: "1px solid rgba(0,0,0,0.08)",
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          color: "#94A3B8",
        }}
      >
        <span style={{ fontFamily: "var(--font-mono), monospace" }}>FOUNDRY · CERTIFICATE OF COMPLETION</span>
        <span>Generated {formatDateTime(new Date().toISOString())}</span>
      </div>
    </section>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        margin: "0 0 12px",
        fontFamily: "var(--font-mono), monospace",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "#9CA3AF",
      }}
    >
      {children}
    </h3>
  );
}

function SummaryCell({
  label,
  value,
  mono,
  last,
}: {
  label: string;
  value: string;
  mono?: boolean;
  last?: boolean;
}) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRight: last ? undefined : "1px solid rgba(0,0,0,0.08)",
      }}
    >
      <p style={{ fontFamily: "var(--font-mono), monospace", fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#94A3B8", margin: 0 }}>
        {label}
      </p>
      <p
        style={{
          margin: "4px 0 0",
          fontFamily: mono ? "var(--font-mono), monospace" : undefined,
          fontSize: 14,
          fontWeight: 600,
          color: "#0F172A",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        padding: "8px 6px",
        textAlign: "left",
        fontFamily: "var(--font-mono), monospace",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "#94A3B8",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  mono,
  strong,
}: {
  children: React.ReactNode;
  mono?: boolean;
  strong?: boolean;
}) {
  return (
    <td
      style={{
        padding: "10px 6px",
        fontFamily: mono ? "var(--font-mono), monospace" : undefined,
        fontSize: 12,
        color: strong ? "#0F172A" : "#475569",
        fontWeight: strong ? 600 : undefined,
      }}
    >
      {children}
    </td>
  );
}
