# New product research — July 2026

Research and concept work for a **new product outside Foundry**: something that benefits Gitwork,
works for small business, and addresses a genuine gap rather than re-entering an existing category.
Commissioned by Dan, July 2026.

Read in order:

| Document | What it is |
|---|---|
| [`00-research.md`](00-research.md) | The evidence base. Traffic shift, the agentic-commerce protocol landscape, the UK legal position, an honest adoption reality-check, and the two design constraints the research rules in. Every claim sourced and tagged primary / secondary / vendor, with forecasts labelled as forecasts |
| [`01-concepts.md`](01-concepts.md) | Three concepts at decision depth, scored against each other, with a recommendation |
| [`02-build-prompt-standing.md`](02-build-prompt-standing.md) | Self-contained build spec for the recommended concept, in the style and with the authority of the root [`BUILD-PROMPT.md`](../../BUILD-PROMPT.md) |

## The finding, in three sentences

Google, Visa, Mastercard, Stripe and OpenAI have all spent eighteen months building the **buyer's**
half of a handshake — signed, verifiable proof of what a customer's AI agent is allowed to buy.
Nobody built the **seller's** half: there is no way for a business to state, in a form a machine can
verify and rely on, what it is willing to be bound to. That gap is invisible for Shopify merchants
with a catalog of fixed prices, and total for the majority of the small business economy, which
sells *work* at a *quote*.

## The recommendation

Build **Standing** — the seller-side mandate. A business defines its terms once; Standing issues
signed, expiring, bounded offers on its behalf, to agents and humans alike, and escalates to a
person the moment a request exceeds the ceiling the business set. The blocker it removes is not
technical but legal: since the CMA's guidance of 9 March 2026 a business is liable for whatever its
AI commits to, at up to 10% of worldwide turnover, even where a third party built the agent. The
product is the bounded, provable commitment that makes saying yes safe.

Eight production systems in Foundry transfer to it directly — the MCP server and its OAuth
provider, the pure costing function, snapshot-at-commitment, the immutable commitment log,
tokenised counterparty pages, signed-request verification, the deterministic-AI discipline from
Dispatch, and the Pulse AI-readiness scanner that becomes the free wedge.

## Status

Research and specification only. **No code written, no repository created.** First moves are in
[`01-concepts.md`](01-concepts.md#first-moves-in-order).
