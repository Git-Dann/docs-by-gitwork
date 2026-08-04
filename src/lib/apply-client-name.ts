/**
 * Propagate a client name into the section data shapes that reference the client.
 *
 * Why this exists:
 *   When a doc is created with `clientName`, the value lands on `Document.clientName` and in
 *   `metadata.client` but does NOT flow into the section data the editor renders. So the cover
 *   still shows "Client name" placeholder, the parties row still says "Client Name" / "Client
 *   organisation", and the customer signature block still says "Client Name". The operator has
 *   to retype the same string in 3-4 places per clone.
 *
 *   `applyClientNameToSections` walks the section payload that's about to be persisted and
 *   patches every customer-side field in one pass. Called from both the create endpoint and the
 *   duplicate endpoint so "swap the client name" actually swaps everything.
 *
 * What it patches (only when `clientName` is non-empty):
 *   - cover.clientName                  → the supplied name (overrides any template default)
 *   - parties.parties[customer].name    → customer party's display name
 *   - parties.parties[customer].organization → customer's org
 *   - parties.parties[customer].email   → cleared (it's per-deal, never a template default)
 *   - signatures.blocks[customer].partyName → customer signature block's party name
 *   - signatures.blocks[customer].signatory{Name,Role,Email,Date} → cleared (per-deal)
 *
 * Who counts as "customer":
 *   In a Gitwork agency template, party.role often reads "Customer", "Client", "Receiving Party",
 *   "Data Controller". Anything that ISN'T "Service Provider", "Disclosing Party", "Data
 *   Processor", or "Gitwork" is treated as customer-side. If multiple parties match (rare), all
 *   of them get patched — the operator can adjust manually if they actually have multiple
 *   counterparties.
 */

interface SectionPayload {
  key: string;
  title: string;
  description?: string | null;
  sortOrder: number;
  isVisible?: boolean;
  data: unknown;
}

const SUPPLIER_ROLE_PATTERNS = [
  /^service provider$/i,
  /^supplier$/i,
  /^disclosing party$/i,
  /^data processor$/i,
  /^gitwork$/i,
];

/** Our own legal name, however it's written — the surest supplier signal when `role` is blank. */
const SUPPLIER_NAME_PATTERN = /\bgitwork\b/i;

/**
 * A `[bracketed]` template placeholder means "a human fills this in" — it is NOT the counterparty.
 * The NDA's third signatory is `[individual name]` (the Founder, who signs personally and is not
 * the Client), so auto-filling it with the client's name would be plainly wrong.
 */
const PLACEHOLDER_PATTERN = /^\s*\[[^\]]+\]\s*$/;

/**
 * True if the role string identifies Gitwork's side of the contract — meaning the entry is
 * NOT the one we should rename to the new client.
 */
function isSupplierRole(role: string | undefined): boolean {
  if (!role) return false;
  return SUPPLIER_ROLE_PATTERNS.some((re) => re.test(role.trim()));
}

/**
 * Supplier-side if EITHER the role says so or the name is ours. Role alone wasn't enough: a
 * template may deliberately leave `role: ""` (the NDA does, so the cover's generated PARTY A/B/C
 * labels win), and `isSupplierRole("")` is false — so every party, Gitwork's own entry included,
 * was being renamed to the incoming client. Matching the name closes that hole.
 */
function isSupplierEntry(role: string | undefined, name: string | undefined): boolean {
  if (isSupplierRole(role)) return true;
  return Boolean(name && SUPPLIER_NAME_PATTERN.test(name));
}

/** Entries we must leave alone: our own side, or a hand-fill `[placeholder]`. */
function isNotTheCounterparty(role: string | undefined, name: string | undefined): boolean {
  return isSupplierEntry(role, name) || Boolean(name && PLACEHOLDER_PATTERN.test(name));
}

interface PartyLike {
  id?: string;
  name?: string;
  role?: string;
  organization?: string;
  email?: string;
  signatureRequired?: boolean;
}

interface SignatureBlockLike {
  id?: string;
  partyName?: string;
  signatoryName?: string;
  signatoryRole?: string;
  signatoryEmail?: string;
  signatureDate?: string;
}

/**
 * Returns a new array of sections with customer-side fields patched to the supplied
 * `clientName`. If `clientName` is empty / undefined, returns the input unchanged so callers
 * can pipe through this regardless of whether they actually have a name to apply.
 */
export function applyClientNameToSections(
  sections: SectionPayload[],
  clientName: string | null | undefined,
): SectionPayload[] {
  const trimmed = clientName?.trim();
  if (!trimmed) return sections;

  return sections.map((section) => {
    if (!section.data || typeof section.data !== "object") return section;
    const data = section.data as Record<string, unknown>;

    switch (section.key) {
      case "cover":
        return {
          ...section,
          data: { ...data, clientName: trimmed },
        };

      case "parties": {
        const parties = Array.isArray(data.parties) ? (data.parties as PartyLike[]) : [];
        if (parties.length === 0) return section;
        const nextParties = parties.map((p) =>
          isNotTheCounterparty(p.role, p.name)
            ? p
            : {
                ...p,
                name: trimmed,
                organization: trimmed,
                email: "",
              },
        );
        return {
          ...section,
          data: { ...data, parties: nextParties },
        };
      }

      case "signatures": {
        const blocks = Array.isArray(data.blocks) ? (data.blocks as SignatureBlockLike[]) : [];
        if (blocks.length === 0) return section;
        // Heuristic: the first block tends to be the supplier (Gitwork by template convention),
        // every other block is customer-side. Operators who reorder blocks can edit manually.
        const nextBlocks = blocks.map((block, index) => {
          // Index 0 is the supplier by template convention; also skip anything that names Gitwork
          // (templates may order parties differently) or is a `[placeholder]` — the NDA's third
          // signatory is the Founder, who signs personally and is NOT the client.
          if (index === 0 || isNotTheCounterparty(block.signatoryRole, block.partyName)) return block;
          return {
            ...block,
            partyName: trimmed,
            signatoryName: "",
            signatoryRole: "",
            signatoryEmail: "",
            signatureDate: "",
          };
        });
        return {
          ...section,
          data: { ...data, blocks: nextBlocks },
        };
      }

      default:
        return section;
    }
  });
}
