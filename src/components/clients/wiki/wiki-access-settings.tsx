"use client";

import { useState } from "react";
import { WikiLinkedClients } from "@/components/clients/wiki/wiki-linked-clients";
import {
  LockClosedIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  UserCircleIcon,
  EyeIcon,
  EyeSlashIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import type { WikiDTO, WikiUserSummary } from "@/lib/api";
import {
  useCreateWikiUser,
  useUpdateWikiUser,
  useDeleteWikiUser,
  useSetWikiShare,
  useSetWikiSectionShare,
  useCourseIngest,
  useSetCourseIngest,
  useIntakeWebhook,
  useSetIntakeWebhook,
  useIntakeKeys,
  useMintIntakeKey,
  useRevokeIntakeKey,
} from "@/hooks/use-wiki";
import type { WikiSection } from "./wiki-sidebar";
import { WikiIntakeCategoriesPanel } from "./wiki-intake-categories-panel";
import { Modal } from "@/components/ui/modal";
import { wikiInviteText } from "@/lib/wiki-invite";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

const inputCls =
  "w-full rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-2 text-sm text-[var(--text-1)] outline-none transition focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-100)]";
const labelCls =
  "mb-1.5 block text-[11px] uppercase tracking-[0.06em] text-[var(--text-4)]";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

// 12-char alphanumeric password using the crypto RNG (unbiased rejection on the
// charset length, so no modulo skew). Handed to the client to log in with.
const PW_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
function generatePassword(length = 12): string {
  const max = Math.floor(256 / PW_CHARSET.length) * PW_CHARSET.length; // reject bytes >= max
  const out: string[] = [];
  const buf = new Uint8Array(1);
  while (out.length < length) {
    crypto.getRandomValues(buf);
    if (buf[0] < max) out.push(PW_CHARSET[buf[0] % PW_CHARSET.length]);
  }
  return out.join("");
}

// Sections that can be shared individually (mirrors SHAREABLE_SECTIONS server-side;
// Design System has its own brand share, dashboard/settings aren't shareable).
const SHARE_SECTION_LABELS: Partial<Record<WikiSection, string>> = {
  timeline: "Timeline",
  monitors: "Monitors",
  documents: "Resources",
  launchpad: "Launchpad",
  insights: "Charts",
  costs: "Running costs",
  estimates: "Estimates",
  comparisons: "Comparisons",
  sheets: "Sheets",
  roundup: "RoundUp",
  delivery: "Delivery",
  support: "Support",
  metrics: "Metrics",
  meetings: "Meetings",
  platforms: "Platforms",
  "code-handover": "Code Handover",
  "design-system": "Design System",
  ia: "Information Architecture",
  "dev-guide": "Developer Guide",
  "api-docs": "API Docs",
  architecture: "Architecture",
  runbook: "Runbook",
  "data-model": "Data Model",
  changelog: "Changelog",
  "course-requests": "Course Requests",
};

export function WikiAccessSettings({
  wiki,
  slug,
  availableSections,
}: {
  wiki: WikiDTO;
  slug: string;
  availableSections: WikiSection[];
}) {
  // Cards are numbered in the order they render, so the sequence never skips — Request
  // categories only exists while Requests is on, and it used to leave a gap (and two 05s).
  let n = 0;
  const next = () => String(++n).padStart(2, "0");

  return (
    // One column, top to bottom in the order you set a client up: who can get in, what they can
    // raise, what systems push in, which other clients' work shows. The old two/three-column
    // masonry left a short card beside a long one and shuffled the numbering.
    <div className="w-full space-y-5">
      <WikiAccessCard wiki={wiki} slug={slug} availableSections={availableSections} n={next()} />
      {wiki.intakeEnabled ? (
        <WikiIntakeCategoriesPanel
          slug={slug}
          categories={wiki.intakeCategories}
          isDefault={wiki.intakeCategoriesAreDefault}
          n={next()}
        />
      ) : null}
      <WikiApiIntakeSettings slug={slug} n={next()} />
      <WikiLinkedClients slug={slug} clientId={wiki.clientId} n={next()} />
    </div>
  );
}

/** The whole-wiki link as the client opens it, or null while the wiki isn't shared. */
function wikiLinkFor(wiki: WikiDTO, slug: string): string | null {
  if (!(wiki.shareEnabled && wiki.shareToken)) return null;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/wiki/${slug}/${wiki.shareToken}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * 01 // ACCESS — the link and the people who can use it, in one card, because neither works
 * without the other: users can't sign in until the wiki is shared, and a shared wiki is locked
 * to its users.
 */
function WikiAccessCard({
  wiki,
  slug,
  availableSections,
  n,
}: {
  wiki: WikiDTO;
  slug: string;
  availableSections: WikiSection[];
  n: string;
}) {
  const setShare = useSetWikiShare(slug);
  const sectionShare = useSetWikiSectionShare(slug);
  const createUser = useCreateWikiUser(slug);
  const updateUser = useUpdateWikiUser(slug);
  const deleteUser = useDeleteWikiUser(slug);

  // null = closed; "new" = add form; otherwise the user being edited.
  const [editing, setEditing] = useState<WikiUserSummary | "new" | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const users = wiki.users ?? [];
  const wikiOn = wiki.shareEnabled && Boolean(wiki.shareToken);
  const pageShares = (wiki.pageShares ?? {}) as Record<string, string>;
  const anyPageShared = Object.keys(pageShares).length > 0;
  const link = wikiLinkFor(wiki, slug);
  const shareable = availableSections.filter((s): s is WikiSection => Boolean(SHARE_SECTION_LABELS[s]));

  function flash(key: string) {
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  }

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label" style={{ fontFamily: MONO }}>
          <span className="widget-header__label--number">{n}</span>
          {" // ACCESS"}
        </span>
        <span className="widget-header__status inline-flex items-center gap-1 shrink-0" style={{ fontFamily: MONO }}>
          <LockClosedIcon className="h-3 w-3" /> SIGN-IN REQUIRED
        </span>
      </div>

      {/* grid-cols-1 is not optional: without it the single narrow-screen column is an
          implicit `auto` track, sized to its widest content rather than the card — the link
          panel ran up to 183px past the edge of a phone, clipped by the card. */}
      <div className="grid grid-cols-1 gap-px bg-[var(--border-1)] lg:grid-cols-2">
        {/* ── The link ── */}
        <div className="min-w-0 space-y-4 bg-[var(--surface-0)] p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--text-1)]">Wiki link</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-4)]">
                One link to every page. Clients sign in with an account from &ldquo;Who can sign
                in&rdquo;; anyone signed in to Foundry can always open it.
              </p>
            </div>
            <ShareToggle on={wikiOn} disabled={setShare.isPending} onClick={() => void setShare.mutateAsync(!wikiOn)} />
          </div>

          {wikiOn && wiki.shareToken ? (
            <ShareLinkRow
              href={`/wiki/${slug}/${wiki.shareToken}`}
              copied={copied === "wiki"}
              onCopy={async () => {
                if (link && (await copyText(link))) flash("wiki");
              }}
            />
          ) : null}

          {/* Per-page links only matter while the whole-wiki link is off — on, every page is
              already in it, and listing ~25 rows of "included" said nothing. */}
          {wikiOn ? (
            <p className="text-[12px] text-[var(--text-4)]">
              Every page is in the wiki link. Turn it off to share pages one at a time.
            </p>
          ) : (
            <details className="group" open={anyPageShared}>
              <summary
                className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] uppercase tracking-[0.06em] text-[var(--text-4)] hover:text-[var(--text-2)] [&::-webkit-details-marker]:hidden"
                style={{ fontFamily: MONO }}
              >
                <span aria-hidden className="inline-block transition-transform group-open:rotate-90">›</span>
                Share single pages instead{anyPageShared ? ` · ${Object.keys(pageShares).length} shared` : ""}
              </summary>
              {shareable.length === 0 ? (
                <p className="mt-3 text-[13px] text-[var(--text-4)]">No shareable pages yet.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {shareable.map((section) => {
                    const token = pageShares[section];
                    const on = Boolean(token);
                    return (
                      <li key={section}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[13px] text-[var(--text-2)]">{SHARE_SECTION_LABELS[section]}</span>
                          <ShareToggle
                            on={on}
                            disabled={sectionShare.isPending}
                            onClick={() => void sectionShare.mutateAsync({ section, enabled: !on })}
                          />
                        </div>
                        {on && token ? (
                          <ShareLinkRow
                            href={`/wiki/${slug}/${token}`}
                            copied={copied === section}
                            onCopy={async () => {
                              if (await copyText(`${window.location.origin}/wiki/${slug}/${token}`)) flash(section);
                            }}
                          />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </details>
          )}
        </div>

        {/* ── Who can sign in ── */}
        <div className="min-w-0 space-y-4 bg-[var(--surface-0)] p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--text-1)]">Who can sign in</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-4)]">
                Each client gets their own email and password.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="app-button app-button-secondary app-button-xs inline-flex shrink-0 items-center gap-1.5"
            >
              <PlusIcon className="h-3.5 w-3.5" /> Add user
            </button>
          </div>

          {users.length > 0 && !wikiOn && !anyPageShared ? (
            <div className="flex items-start gap-2.5 rounded-[8px] border border-amber-300 bg-amber-50 p-3">
              <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-[12px] leading-relaxed text-amber-800">
                Nothing is shared yet, so these people <strong>can&apos;t sign in</strong>. Turn on
                the wiki link.
              </p>
            </div>
          ) : null}

          {users.length === 0 ? (
            <p className="rounded-[8px] border border-dashed border-[var(--border-2)] px-4 py-6 text-center text-[13px] text-[var(--text-4)]">
              No client users yet — only Gitwork staff can open the link.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border-1)] overflow-hidden rounded-[8px] border border-[var(--border-1)]">
              {users.map((u) => {
                const invite = wikiInviteText({ clientName: wiki.clientName, link, email: u.email, name: u.name });
                return (
                  <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5">
                    <UserCircleIcon className="h-7 w-7 shrink-0 text-[var(--text-4)]" />
                    <div className="min-w-[160px] flex-1">
                      <div className="truncate text-[13px] font-medium text-[var(--text-1)]" title={u.email}>
                        {u.email}
                      </div>
                      <div className="truncate text-[11px] text-[var(--text-4)]">
                        {u.name ? `${u.name} · ` : ""}Added {formatDate(u.createdAt)}
                      </div>
                    </div>
                    {confirmingDelete === u.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] text-[var(--text-4)]">Remove?</span>
                        <button
                          type="button"
                          disabled={deleteUser.isPending}
                          onClick={async () => {
                            await deleteUser.mutateAsync(u.id);
                            setConfirmingDelete(null);
                          }}
                          className="rounded-[6px] bg-[var(--danger-500)] px-2.5 py-1 text-[12px] font-medium text-white disabled:opacity-50"
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingDelete(null)}
                          className="rounded-[6px] border border-[var(--border-2)] px-2.5 py-1 text-[12px] text-[var(--text-2)] hover:bg-[var(--surface-1)]"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={!invite}
                          onClick={async () => {
                            if (invite && (await copyText(invite))) flash(`invite-${u.id}`);
                          }}
                          title={
                            invite
                              ? "Copy a ready-to-send message with the link and their email. The password isn't stored, so it says it was sent separately — use Edit → Reset & generate for one to include."
                              : "Turn on the wiki link first — there's nowhere for them to sign in yet."
                          }
                          className="inline-flex h-8 items-center gap-1 rounded-[6px] px-2 text-[12px] font-medium text-[var(--brand-700)] hover:bg-[var(--surface-1)] disabled:cursor-not-allowed disabled:text-[var(--text-4)] disabled:opacity-60"
                        >
                          {copied === `invite-${u.id}` ? <CheckIcon className="h-4 w-4" /> : <ClipboardDocumentIcon className="h-4 w-4" />}
                          {copied === `invite-${u.id}` ? "Copied" : "Copy details"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(u)}
                          title="Edit or reset password"
                          aria-label={`Edit ${u.email}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-[var(--text-4)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
                        >
                          <PencilSquareIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingDelete(u.id)}
                          title="Remove"
                          aria-label={`Remove ${u.email}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-[var(--text-4)] hover:bg-[var(--surface-1)] hover:text-[var(--danger-500)]"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {editing ? (
        <WikiUserModal
          mode={editing === "new" ? "create" : "edit"}
          user={editing === "new" ? null : editing}
          busy={createUser.isPending || updateUser.isPending}
          clientName={wiki.clientName}
          link={link}
          onClose={() => setEditing(null)}
          onSubmit={async ({ email, name, password }) => {
            if (editing === "new") {
              await createUser.mutateAsync({ email, name, password: password ?? "" });
            } else {
              await updateUser.mutateAsync({
                id: editing.id,
                data: { email, name, ...(password ? { password } : {}) },
              });
            }
          }}
        />
      ) : null}
    </section>
  );
}

function WikiApiIntakeSettings({ slug, n }: { slug: string; n: string }) {
  const { data, isPending } = useCourseIngest(slug, true);
  const setIngest = useSetCourseIngest(slug);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmDisable, setConfirmDisable] = useState(false);

  const token = data?.token ?? null;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const courseEndpoint = token ? `${origin}/api/public/course-requests/${token}` : "";
  const wikiItemsEndpoint = token ? `${origin}/api/public/wiki-items/${token}` : "";
  const intakePagePath = `/app/portal/${slug}/wiki#intake`;
  // Shows the full field set the API accepts, including the ones added with the
  // intake API (externalUrl, attachmentUrls, status) — a client only sends what
  // they can see documented. Friendly values on purpose: "Feature request" and
  // "High" are accepted as-is, so nobody has to learn our enum names.
  const example = token
    ? `curl -X POST ${wikiItemsEndpoint} \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "title": "Scorecard total is incorrect",\n    "description": "Steps to reproduce...",\n    "type": "Bug",\n    "priority": "High",\n    "status": "New",\n    "requestedBy": "Big Wedge app",\n    "externalRef": "bug_123",\n    "externalUrl": "https://tracker.example.com/bug_123",\n    "attachmentUrls": ["https://tracker.example.com/files/shot.png"]\n  }'`
    : "";
  const busy = setIngest.isPending;

  async function copy(key: string, text: string) {
    if (await copyText(text)) {
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    }
  }

  const endpoints = [
    { key: "items", label: "Create — bug / feedback / feature request", method: "POST", value: wikiItemsEndpoint },
    // Update + list shipped with the intake API (docs/client-intake-api.md).
    // Listed here because a client can't discover an endpoint that isn't shown.
    { key: "update", label: "Update one — their ref or ours", method: "PATCH", value: `${wikiItemsEndpoint}/{ref}` },
    { key: "list", label: "List what we hold", method: "GET", value: `${wikiItemsEndpoint}?items=1` },
    { key: "courses", label: "Wedge course requests", method: "POST", value: courseEndpoint },
    { key: "image", label: "Attach a screenshot (multipart `file`)", method: "POST", value: token ? `${origin}/api/wiki/${token}/intake-items/{id}/image` : "" },
  ];
  // Everything an integrator needs in one paste, so it isn't five separate copies.
  const handover = token
    ? [
        "Foundry intake API",
        "Docs: docs/client-intake-api.md",
        "",
        ...endpoints.map((e) => `${e.label}\n${e.method} ${e.value}`),
      ].join("\n\n")
    : "";

  const folding = (label: string, body: React.ReactNode) => (
    <details className="group rounded-[8px] border border-[var(--border-1)]">
      <summary
        className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-3 text-[11px] uppercase tracking-[0.06em] text-[var(--text-3)] hover:text-[var(--text-1)] [&::-webkit-details-marker]:hidden"
        style={{ fontFamily: MONO }}
      >
        <span aria-hidden className="inline-block transition-transform group-open:rotate-90">›</span>
        {label}
      </summary>
      <div className="space-y-4 border-t border-[var(--border-1)] p-4">{body}</div>
    </details>
  );

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label" style={{ fontFamily: MONO }}>
          <span className="widget-header__label--number">{n}</span>
          {" // API INTAKE"}
        </span>
        <span className="widget-header__status shrink-0" style={{ fontFamily: MONO }}>
          {isPending ? "" : token ? "ON" : "OFF"}
        </span>
      </div>
      <div className="space-y-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="max-w-[70ch]">
            <p className="text-[13px] leading-relaxed text-[var(--text-3)]">
              Lets a client&rsquo;s own system push bugs, feedback and requests straight into{" "}
              <a href={intakePagePath} className="text-[var(--brand-700)] hover:underline">Requests</a>, and keep their
              status in sync.
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--danger-500)]">
              Send them this token only — never the workspace API key, which opens every client&rsquo;s data.
            </p>
          </div>
          <ShareToggle
            on={Boolean(token)}
            disabled={busy || isPending}
            onClick={() => {
              if (token) setConfirmDisable(true);
              else setIngest.mutate({ enabled: true });
            }}
          />
        </div>

        {isPending ? (
          <p className="text-[13px] text-[var(--text-4)]">Loading…</p>
        ) : !token ? null : (
          <>
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-4)]">
                  Create a request (POST)
                </span>
                <button
                  type="button"
                  onClick={() => void copy("handover", handover)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--brand-700)] hover:text-[var(--brand-800)]"
                  title="Every endpoint and the docs path, ready to send to their developer"
                >
                  {copied === "handover" ? <CheckIcon className="h-3.5 w-3.5" /> : <ClipboardDocumentIcon className="h-3.5 w-3.5" />}
                  {copied === "handover" ? "Copied" : "Copy everything for their developer"}
                </button>
              </div>
              <div className="break-all rounded-[8px] border border-[var(--border-1)] bg-[var(--surface-1)] px-3 py-2 text-[12px] text-[var(--text-2)]" style={{ fontFamily: MONO }}>
                {wikiItemsEndpoint}
              </div>
            </div>

            {folding("Integration guide — every endpoint, an example and the fields", (
              <>
                <div className="grid gap-x-5 gap-y-4 lg:grid-cols-2">
                  {endpoints.map((row) => (
                    <div key={row.key}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-4)]">{row.label}</span>
                        <button type="button" onClick={() => void copy(row.key, row.value)} className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--brand-700)] hover:text-[var(--brand-800)]">
                          {copied === row.key ? <CheckIcon className="h-3.5 w-3.5" /> : <ClipboardDocumentIcon className="h-3.5 w-3.5" />}
                          {copied === row.key ? "Copied" : "Copy"}
                        </button>
                      </div>
                      <div className="break-all rounded-[8px] border border-[var(--border-1)] bg-[var(--surface-1)] px-3 py-2 text-[12px] text-[var(--text-2)]" style={{ fontFamily: MONO }}>
                        <span className="text-[var(--text-4)]">{row.method} </span>{row.value}
                      </div>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-4)]">Example bug push</span>
                    <button type="button" onClick={() => void copy("example", example)} className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--brand-700)] hover:text-[var(--brand-800)]">
                      {copied === "example" ? <CheckIcon className="h-3.5 w-3.5" /> : <ClipboardDocumentIcon className="h-3.5 w-3.5" />}
                      {copied === "example" ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <pre className="overflow-x-auto rounded-[8px] border border-[var(--border-1)] bg-[#0f1115] px-3 py-2.5 text-[11.5px] leading-5 text-[#d6deeb]" style={{ fontFamily: MONO }}>{example}</pre>
                </div>
                <p className="text-[12px] leading-5 text-[var(--text-4)]">
                  Only <span style={{ fontFamily: MONO }}>title</span> is required. <span style={{ fontFamily: MONO }}>type</span> takes Bug,
                  Feedback, Task or Design; <span style={{ fontFamily: MONO }}>priority</span> Low, Medium or High. Send one object or{" "}
                  {`{"items":[…]}`} for up to 200. Sending the same <span style={{ fontFamily: MONO }}>externalRef</span> twice is
                  deduped, so retries are safe. Every item lands on Requests first; only an Admin can promote it to a task.
                </p>
              </>
            ))}

            {folding("Advanced — per-integrator keys and status webhook", (
              <>
                <IntakeKeysField slug={slug} />
                <IntakeWebhookField slug={slug} />
              </>
            ))}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-1)] pt-4">
              {confirmDisable ? (
                <>
                  <span className="text-[12px] text-[var(--text-3)]">Turn intake off? The token stops working immediately.</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setConfirmDisable(false)} className="app-button app-button-secondary app-button-xs">Keep</button>
                    <button type="button" disabled={busy} onClick={() => { setIngest.mutate({ enabled: false }); setConfirmDisable(false); }} className="rounded-[6px] bg-[var(--danger-500)] px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-60">Turn off</button>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-[12px] text-[var(--text-4)]">Leaked? Rotate it — the old token stops working.</span>
                  <button type="button" disabled={busy} onClick={() => setIngest.mutate({ enabled: true, rotate: true })} className="app-button app-button-secondary app-button-xs disabled:opacity-60">
                    {busy ? "Working…" : "Rotate token"}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function ShareToggle({
  on,
  disabled,
  onClick,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className="relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50"
      style={{ background: on ? "var(--brand-600)" : "var(--border-2)" }}
    >
      <span
        className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all"
        style={{ left: on ? 18 : 2 }}
      />
    </button>
  );
}

function ShareLinkRow({
  href,
  copied,
  onCopy,
}: {
  href: string;
  copied: boolean;
  onCopy: () => void;
}) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <div className="mt-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <p
          className="min-w-0 flex-1 truncate rounded-[7px] border border-[var(--border-1)] bg-[var(--surface-1)] px-2.5 py-1.5 text-[11px] text-[var(--text-3)]"
          style={{ fontFamily: MONO }}
          // Ellipsed on a phone — the full link has to be readable somewhere besides the clipboard.
          title={`${origin}${href}`}
        >
          {origin}
          {href}
        </p>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex shrink-0 items-center gap-1 rounded-[7px] bg-[var(--brand-600)] px-2.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[var(--brand-700)]"
        >
          {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <ClipboardDocumentIcon className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center justify-center rounded-[7px] border border-[var(--border-2)] px-2.5 py-1.5 text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
          title="Open"
          aria-label="Open the link"
        >
          <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
        </a>
      </div>
      {/* The unfurl card a recipient sees when the link is pasted — folded, because it is a
          340px image to check once, not something to scroll past every visit. */}
      <details className="group">
        <summary
          className="cursor-pointer list-none text-[11px] uppercase tracking-[0.06em] text-[var(--text-4)] hover:text-[var(--text-2)] [&::-webkit-details-marker]:hidden"
          style={{ fontFamily: MONO }}
        >
          <span aria-hidden className="mr-1.5 inline-block transition-transform group-open:rotate-90">›</span>
          Preview when pasted
        </summary>
        <div className="mt-2 overflow-hidden rounded-[8px] border border-[var(--border-1)] bg-[var(--surface-1)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${href}/opengraph-image`} alt="Link preview" loading="lazy" className="block aspect-[1200/630] w-full object-cover" />
        </div>
      </details>
    </div>
  );
}

function WikiUserModal({
  mode,
  user,
  busy,
  clientName,
  link,
  onClose,
  onSubmit,
}: {
  mode: "create" | "edit";
  user: WikiUserSummary | null;
  busy: boolean;
  clientName: string;
  link: string | null;
  onClose: () => void;
  onSubmit: (input: { email: string; name: string; password?: string }) => Promise<void>;
}) {
  const [email, setEmail] = useState(user?.email ?? "");
  const [name, setName] = useState(user?.name ?? "");
  // A new user gets a generated password up front — the usual case is "make an account and
  // send it", so starting with one saves a click and a weak hand-typed password.
  const [password, setPassword] = useState(() => (mode === "create" ? generatePassword() : ""));
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState(mode === "create");
  const [copied, setCopied] = useState<"password" | "invite" | null>(null);
  // After saving, the dialog stays open on the one screen where the password is still known.
  const [saved, setSaved] = useState<{ email: string; name: string; password: string | null } | null>(null);

  function flash(k: "password" | "invite") {
    setCopied(k);
    setTimeout(() => setCopied(null), 1500);
  }

  async function handleSave() {
    setError(null);
    if (!email.trim()) return setError("Email is required.");
    if (mode === "create" && password.trim().length < 8) return setError("Password must be at least 8 characters.");
    if (mode === "edit" && password.length > 0 && password.length < 8) return setError("Password must be at least 8 characters.");
    try {
      await onSubmit({ email: email.trim(), name: name.trim(), password: password || undefined });
      setSaved({ email: email.trim(), name: name.trim(), password: password || null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  }

  const invite = saved
    ? wikiInviteText({ clientName, link, email: saved.email, name: saved.name, password: saved.password })
    : null;

  return (
    <Modal
      open
      onClose={onClose}
      title={saved ? (mode === "create" ? "User added" : "User saved") : mode === "create" ? "Add client user" : "Edit user"}
      panelClassName="w-full max-w-md"
    >
      {saved ? (
        <div className="space-y-4 p-5">
          {invite ? (
            <>
              <p className="text-[13px] text-[var(--text-3)]">
                {saved.password
                  ? "Copy this and send it to them — it's the only time the password can be shown."
                  : "Copy this and send it to them. The password wasn't changed, so it says it was sent separately."}
              </p>
              <pre className="whitespace-pre-wrap break-words rounded-[8px] border border-[var(--border-1)] bg-[var(--surface-1)] p-3 text-[12px] leading-5 text-[var(--text-2)]" style={{ fontFamily: MONO }}>
                {invite}
              </pre>
            </>
          ) : (
            <p className="text-[13px] text-[var(--text-3)]">
              Saved. The wiki link is off, so there&rsquo;s nowhere for them to sign in yet — turn it on, then
              use <strong>Copy details</strong> next to their name.
              {saved.password ? " Copy the password now; it can't be shown again." : ""}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!invite && saved.password ? (
              <button type="button" onClick={async () => { if (await copyText(saved.password!)) flash("password"); }} className="app-button app-button-secondary app-button-sm">
                {copied === "password" ? "Copied" : "Copy password"}
              </button>
            ) : null}
            {invite ? (
              <button type="button" onClick={async () => { if (await copyText(invite)) flash("invite"); }} className="app-button app-button-primary app-button-sm inline-flex items-center gap-1.5">
                {copied === "invite" ? <CheckIcon className="h-4 w-4" /> : <ClipboardDocumentIcon className="h-4 w-4" />}
                {copied === "invite" ? "Copied" : "Copy sign-in details"}
              </button>
            ) : null}
            <button type="button" onClick={onClose} className="app-button app-button-secondary app-button-sm">
              Done
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 p-5">
          <div>
            <label className={labelCls} style={{ fontFamily: MONO }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" className={inputCls} />
          </div>
          <div>
            <label className={labelCls} style={{ fontFamily: MONO }}>Name (optional)</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" className={inputCls} />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className={labelCls.replace("mb-1.5 ", "")} style={{ fontFamily: MONO }}>Password</label>
              <button
                type="button"
                onClick={() => {
                  setPassword(generatePassword());
                  setReveal(true);
                }}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--brand-700)] hover:text-[var(--brand-800)]"
              >
                <ArrowPathIcon className="h-3.5 w-3.5" />
                {mode === "edit" ? "Reset & generate" : "New password"}
              </button>
            </div>
            <div className="relative">
              <input
                type={reveal ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "edit" ? "Leave blank to keep current" : "At least 8 characters"}
                autoComplete="new-password"
                className={`${inputCls} ${password ? "pr-16" : ""}`}
                style={reveal ? { fontFamily: MONO, letterSpacing: "0.04em" } : undefined}
              />
              {password ? (
                <div className="absolute inset-y-0 right-1.5 flex items-center gap-0.5">
                  <button type="button" onClick={() => setReveal((v) => !v)} title={reveal ? "Hide" : "Show"} className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--text-4)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]">
                    {reveal ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                  </button>
                  <button type="button" onClick={async () => { if (await copyText(password)) flash("password"); }} title="Copy password" className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--text-4)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]">
                    {copied === "password" ? <CheckIcon className="h-4 w-4 text-[var(--success-500)]" /> : <ClipboardDocumentIcon className="h-4 w-4" />}
                  </button>
                </div>
              ) : null}
            </div>
            <p className="mt-1 text-[11px] text-[var(--text-4)]">
              {mode === "create"
                ? "Generated for you. After saving you'll get the sign-in details to copy."
                : "A new password replaces the old one when you save — you'll get the details to send."}
            </p>
          </div>
          {error ? <p className="text-[13px] text-[var(--danger-500)]">{error}</p> : null}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="app-button app-button-secondary app-button-sm">Cancel</button>
            <button type="button" onClick={handleSave} disabled={busy} className="app-button app-button-primary app-button-sm disabled:opacity-50">
              {busy ? "Saving…" : mode === "create" ? "Add user" : "Save"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * Outbound webhook for intake changes — the other half of two-way sync. Without
 * it a client has to poll `?items=1` to notice we triaged, promoted or closed
 * their request.
 *
 * The signing secret is shown ONCE, on save: it's never returned by a read, so
 * there's nowhere to go back and look it up. Saying so up front avoids someone
 * closing the panel and losing it.
 */
function IntakeWebhookField({ slug }: { slug: string }) {
  const { data, isPending } = useIntakeWebhook(slug, true);
  const save = useSetIntakeWebhook(slug);
  const [draft, setDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = data?.url ?? "";
  const value = draft ?? current;
  const freshSecret = data?.secret ?? null;

  async function submit(next: string | null) {
    setError(null);
    try {
      await save.mutateAsync(next);
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that URL.");
    }
  }

  return (
    <div className="rounded-[10px] border border-[var(--border-1)] bg-[var(--surface-1)] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-4)]">
        Status webhook (optional)
      </p>
      <p className="mt-1.5 max-w-[80ch] text-[12px] leading-5 text-[var(--text-3)]">
        We POST here when a request changes on our side — triaged, promoted to a task,
        closed or deleted — so their tracker follows without polling. https only, and the
        host must be publicly resolvable.
      </p>

      {isPending ? (
        <p className="mt-3 text-[12px] text-[var(--text-4)]">Loading…</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={value}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="https://their-system.example.com/hooks/foundry"
              className="min-w-[280px] flex-1 rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2 text-[13px] text-[var(--text-1)] outline-none transition focus:border-[var(--brand-500)]"
              style={{ fontFamily: MONO }}
            />
            <button
              type="button"
              disabled={save.isPending || value.trim() === current}
              onClick={() => void submit(value.trim() || null)}
              className="rounded-[7px] bg-[var(--brand-700)] px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-[var(--brand-800)] disabled:opacity-50"
            >
              {save.isPending ? "Saving…" : current ? "Update" : "Enable"}
            </button>
            {current ? (
              <button
                type="button"
                disabled={save.isPending}
                onClick={() => void submit(null)}
                className="rounded-[7px] border border-[var(--border-2)] bg-white px-3 py-2 text-[12px] font-medium text-[var(--text-3)] transition hover:text-[var(--danger-500)] disabled:opacity-50"
              >
                Turn off
              </button>
            ) : null}
          </div>

          {error ? (
            <p className="mt-2 text-[12px] text-[var(--danger-500)]">{error}</p>
          ) : null}

          {freshSecret ? (
            <div className="mt-3 rounded-[8px] border border-amber-300 bg-amber-50 p-3">
              <p className="text-[12px] font-semibold text-amber-800">
                Signing secret — copy it now, it isn&rsquo;t shown again
              </p>
              <p className="mt-1 text-[11px] leading-5 text-amber-800">
                They verify each delivery with it: HMAC-SHA256 over the raw body, compared
                against the <span style={{ fontFamily: MONO }}>X-Foundry-Signature</span>{" "}
                header. Without checking it, anyone who learns the URL could post fake
                status changes into their tracker.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code
                  className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-[6px] border border-amber-300 bg-white px-2 py-1.5 text-[12px]"
                  style={{ fontFamily: MONO }}
                >
                  {freshSecret}
                </code>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(freshSecret);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    } catch {
                      /* clipboard blocked — it's selectable on screen */
                    }
                  }}
                  className="shrink-0 rounded-[6px] border border-amber-300 bg-white px-2 py-1.5 text-[12px] font-medium text-amber-800"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          ) : data?.hasSecret ? (
            <p className="mt-2 text-[11px] text-[var(--text-4)]">
              A signing secret is set. It can&rsquo;t be shown again — save a new URL to mint
              a fresh one.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * Named per-integrator keys. The shared wiki token above still works — these exist
 * so a client with SEVERAL systems pushing can have one revoked without breaking
 * the others, which the single shared token can't express (rotating it breaks
 * everything at once, including Wedge's course feed).
 *
 * A minted key is displayed once and never again: only a hash is stored, so there
 * is nothing to go back and look up.
 */
function IntakeKeysField({ slug }: { slug: string }) {
  const { data, isPending } = useIntakeKeys(slug, true);
  const mint = useMintIntakeKey(slug);
  const revoke = useRevokeIntakeKey(slug);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<{ name: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  const keys = data?.keys ?? [];
  const active = keys.filter((k) => !k.revokedAt);

  return (
    <div className="rounded-[10px] border border-[var(--border-1)] bg-[var(--surface-1)] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-4)]">
        Per-integrator keys (optional)
      </p>
      <p className="mt-1.5 max-w-[80ch] text-[12px] leading-5 text-[var(--text-3)]">
        Issue a separate key per system so you can revoke one without breaking the others.
        The shared token above keeps working — only reach for these when a client has more
        than one integration.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Whose system? e.g. Luke's tracker"
          className="min-w-[220px] flex-1 rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2 text-[13px] text-[var(--text-1)] outline-none transition focus:border-[var(--brand-500)]"
        />
        <button
          type="button"
          disabled={mint.isPending || !name.trim()}
          onClick={async () => {
            const res = await mint.mutateAsync(name.trim());
            setFresh({ name: name.trim(), key: res.key });
            setName("");
          }}
          className="rounded-[7px] bg-[var(--brand-700)] px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-[var(--brand-800)] disabled:opacity-50"
        >
          {mint.isPending ? "Creating…" : "Create key"}
        </button>
      </div>

      {fresh ? (
        <div className="mt-3 rounded-[8px] border border-amber-300 bg-amber-50 p-3">
          <p className="text-[12px] font-semibold text-amber-800">
            Key for {fresh.name} — copy it now, it isn&rsquo;t shown again
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code
              className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-[6px] border border-amber-300 bg-white px-2 py-1.5 text-[12px]"
              style={{ fontFamily: MONO }}
            >
              {fresh.key}
            </code>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(fresh.key);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {
                  /* clipboard blocked — selectable on screen */
                }
              }}
              className="shrink-0 rounded-[6px] border border-amber-300 bg-white px-2 py-1.5 text-[12px] font-medium text-amber-800"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-amber-800">
            They use it exactly like the shared token — same endpoints, same payloads.
          </p>
        </div>
      ) : null}

      {isPending ? (
        <p className="mt-3 text-[12px] text-[var(--text-4)]">Loading…</p>
      ) : keys.length === 0 ? (
        <p className="mt-3 text-[11px] text-[var(--text-4)]">
          No named keys — this client uses the shared token above.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--border-2)] overflow-hidden rounded-[8px] border border-[var(--border-2)] bg-white">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-[var(--text-1)]">
                  {k.name}
                  {k.revokedAt ? (
                    <span className="ml-2 text-[11px] font-normal text-[var(--danger-500)]">
                      revoked
                    </span>
                  ) : null}
                </span>
                <span className="block truncate text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
                  {k.prefix}… ·{" "}
                  {k.lastUsedAt
                    ? `last used ${formatDate(k.lastUsedAt)}`
                    : "never used"}
                </span>
              </span>
              {k.revokedAt ? null : confirmRevoke === k.id ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-[12px] text-[var(--danger-500)]">Revoke?</span>
                  <button
                    type="button"
                    disabled={revoke.isPending}
                    onClick={async () => {
                      await revoke.mutateAsync(k.id);
                      setConfirmRevoke(null);
                    }}
                    className="rounded-[6px] bg-rose-600 px-2 py-1 text-[12px] font-semibold text-white disabled:opacity-60"
                  >
                    Revoke
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRevoke(null)}
                    className="px-1 text-[12px] text-[var(--text-4)]"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmRevoke(k.id)}
                  className="shrink-0 rounded-[6px] border border-[var(--border-2)] px-2 py-1 text-[12px] font-medium text-[var(--text-3)] transition hover:border-rose-300 hover:text-rose-600"
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {active.length > 0 ? (
        <p className="mt-2 text-[11px] text-[var(--text-4)]">
          {active.length} active {active.length === 1 ? "key" : "keys"}. Revoking one leaves the
          others — and the shared token — working.
        </p>
      ) : null}
    </div>
  );
}
