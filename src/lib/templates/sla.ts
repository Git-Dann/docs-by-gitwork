/**
 * SLA (Service Level Agreement) template blueprint.
 *
 * Structured editors back every section here — see corresponding section data shapes in
 * `src/types/proposal.ts`. Default copy is intentionally tagged `[REVIEW]` so anyone using the
 * template knows they're looking at a starting point, not pre-approved legal text.
 *
 * **Important:** this template is a starting point only. Legal counsel must review every SLA
 * before it goes to a counterparty. Gitwork takes no responsibility for unreviewed contracts
 * generated from this scaffold.
 */

import type { SectionBlueprint } from "@/lib/default-template";
import { GITWORK } from "@/lib/gitwork";

function id() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2, 10)}`;
}

export const slaSectionBlueprints: SectionBlueprint[] = [
  {
    key: "cover",
    title: "Cover",
    description: "Front page and confidentiality metadata.",
    data: {
      proposalTitle: "Service Level Agreement",
      productName: "",
      clientName: "Client name",
      subtitle: "v1.0",
      date: new Date().toISOString().slice(0, 10),
      confidentiality: "Confidential. Between the parties named on the cover.",
      confidentialityMode: "EXTERNAL",
      heroImage: "",
      brandLockup: "GITWORK",
    },
  },
  {
    key: "parties",
    title: "Parties",
    description: "Counterparties to this Agreement.",
    data: {
      intro:
        "This Service Level Agreement is entered into between the following parties (each a “Party”, together the “Parties”):",
      parties: [
        {
          id: id(),
          name: GITWORK.legalName,
          role: "Service Provider",
          organization: GITWORK.legalName,
          email: GITWORK.email,
          signatureRequired: true,
        },
        {
          id: id(),
          name: "Client Name",
          role: "Customer",
          organization: "Client organisation",
          email: "[REVIEW] client primary contact email",
          signatureRequired: true,
        },
      ],
    },
  },
  {
    key: "service_tiers",
    title: "Services & Service Tiers",
    description: "Services covered by this SLA, grouped by tier.",
    data: {
      intro:
        "The Service Provider shall make the following services available to the Customer at the tier(s) selected in the engagement order. [REVIEW] confirm exact tiers and services covered.",
      tiers: [
        {
          id: id(),
          name: "Standard",
          services:
            "Application hosting, monitoring, weekly dependency updates, business-hours support.",
          uptimeTarget: "99.5%",
          supportHours: "Mon–Fri 09:00–18:00 UK",
        },
        {
          id: id(),
          name: "Premium",
          services:
            "Everything in Standard plus 24/7 incident response, dedicated account manager, monthly review calls.",
          uptimeTarget: "99.9%",
          supportHours: "24/7 incident response, business hours for non-urgent",
        },
      ],
    },
  },
  {
    key: "response_times",
    title: "Response & Resolution Targets",
    description: "Time-to-respond and time-to-resolve commitments by incident priority.",
    data: {
      intro:
        "All targets are measured from the moment a ticket is acknowledged by the Service Provider in writing. Times exclude periods awaiting Customer input.",
      priorities: [
        {
          id: id(),
          priority: "P1 – Critical",
          definition:
            "Production system is fully down or unusable; data loss or security breach in progress.",
          firstResponse: "Within 1 business hour",
          resolution: "Within 4 business hours",
        },
        {
          id: id(),
          priority: "P2 – High",
          definition:
            "Significant feature unavailable; production degraded but service usable; no workaround.",
          firstResponse: "Within 4 business hours",
          resolution: "Within 1 business day",
        },
        {
          id: id(),
          priority: "P3 – Medium",
          definition:
            "Minor feature unavailable or behaving incorrectly with a viable workaround.",
          firstResponse: "Within 1 business day",
          resolution: "Within 5 business days",
        },
        {
          id: id(),
          priority: "P4 – Low",
          definition:
            "Cosmetic issue, documentation gap, or improvement request with no operational impact.",
          firstResponse: "Within 3 business days",
          resolution: "Next scheduled release",
        },
      ],
    },
  },
  {
    key: "escalation",
    title: "Escalation Procedure",
    description: "Path for escalating unresolved incidents.",
    data: {
      intro:
        "If a target is missed or the Customer is dissatisfied with progress, the Customer may escalate as follows:",
      levels: [
        {
          id: id(),
          level: 1,
          contact: "Account Manager",
          timeframe: "Immediately on missed first-response target",
          criteria: "Acknowledgement and updated ETA required within 1 business hour.",
        },
        {
          id: id(),
          level: 2,
          contact: "Service Delivery Lead",
          timeframe: "After 1 business day without resolution progress",
          criteria: "Written status update and corrective action plan required.",
        },
        {
          id: id(),
          level: 3,
          contact: "Director / Founder",
          timeframe: "After 2 business days without resolution",
          criteria: "Joint review call within 1 business day; senior incident owner assigned.",
        },
      ],
    },
  },
  {
    key: "exclusions",
    title: "Exclusions",
    description: "Events that do not count against SLA targets.",
    data: {
      intro:
        "The following events do not constitute SLA breaches and are excluded from uptime and response calculations:",
      items: [
        {
          id: id(),
          exclusion: "Scheduled maintenance windows",
          rationale:
            "Notified to the Customer at least 5 business days in advance and performed outside business hours where reasonably possible.",
        },
        {
          id: id(),
          exclusion: "Force majeure events",
          rationale:
            "Including but not limited to natural disasters, geopolitical events, internet backbone outages outside the Service Provider's control.",
        },
        {
          id: id(),
          exclusion: "Third-party service failures",
          rationale:
            "Where the Service Provider depends on a third-party platform (e.g. cloud provider, payment processor) and the failure originates with that provider.",
        },
        {
          id: id(),
          exclusion: "Customer-caused issues",
          rationale:
            "Misconfiguration by the Customer, exceeding agreed usage limits, or modifications made outside the change-control process.",
        },
      ],
    },
  },
  {
    key: "penalties",
    title: "Service Credits",
    description: "Credits payable when targets are missed.",
    data: {
      intro:
        "If the Service Provider fails to meet the uptime target in any calendar month, the Customer may claim the following service credits against the next invoice. Credits do not constitute a refund and the Customer waives any further remedy for the relevant breach.",
      tiers: [
        {
          id: id(),
          trigger: "Uptime falls below tier target but ≥ 99.0%",
          credit: "10% of that month's recurring fee",
          cap: "—",
        },
        {
          id: id(),
          trigger: "Uptime between 95.0% and 98.9%",
          credit: "25% of that month's recurring fee",
          cap: "—",
        },
        {
          id: id(),
          trigger: "Uptime below 95.0%",
          credit: "50% of that month's recurring fee",
          cap: "Capped at 100% in any rolling 12-month period",
        },
      ],
    },
  },
  {
    key: "term",
    title: "Term & Termination",
    description: "Duration, renewal, notice period, governing law.",
    data: {
      effectiveDate: new Date().toISOString().slice(0, 10),
      initialTermMonths: 12,
      autoRenew: true,
      renewalTerm: "Successive 12-month periods",
      noticePeriodDays: 60,
      governingLaw: "England and Wales",
      terminationForCause:
        "Either Party may terminate this Agreement for cause on 30 days' written notice if the other Party commits a material breach that remains uncured at the end of the notice period.",
    },
  },
  {
    key: "signatures",
    title: "Signatures",
    description: "Authorised signatories for each party.",
    data: {
      intro: "Signed for and on behalf of:",
      blocks: [
        {
          id: id(),
          type: "gitwork",
          variableName: "Gitwork Signature",
          partyName: GITWORK.legalName,
          signatoryName: "[REVIEW] authorised signatory name",
          signatoryRole: "Director",
          signatoryEmail: "[REVIEW] signatory email",
          signatureDate: "",
        },
        {
          id: id(),
          type: "client",
          variableName: "Client Signature",
          partyName: "Client organisation",
          signatoryName: "[REVIEW] authorised signatory name",
          signatoryRole: "[REVIEW] role",
          signatoryEmail: "[REVIEW] signatory email",
          signatureDate: "",
        },
      ],
    },
  },
];
