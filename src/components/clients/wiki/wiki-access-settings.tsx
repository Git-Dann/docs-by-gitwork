"use client";

import { useState } from "react";
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
  GlobeAltIcon,
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
} from "@/hooks/use-wiki";
import type { WikiSection } from "./wiki-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

const inputCls =
  "w-full rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm text-[var(--text-1)] outline-none transition focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-100)]";
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
  documents: "Documents",
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
  const createUser = useCreateWikiUser(slug);
  const updateUser = useUpdateWikiUser(slug);
  const deleteUser = useDeleteWikiUser(slug);

  // null = closed; "new" = add form; otherwise the user being edited.
  const [editing, setEditing] = useState<WikiUserSummary | "new" | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const users = wiki.users ?? [];
  // Client sign-in needs a shared surface to land on — either the whole wiki OR
  // any shared section (e.g. Design System). With users added but nothing shared,
  // sign-in fails ("no workspace found").
  const wikiShared =
    (wiki.shareEnabled && Boolean(wiki.shareToken)) ||
    Object.keys(wiki.pageShares ?? {}).length > 0;

  return (
    <div className="mx-auto w-full max-w-5xl">
      {/* Two-column masonry — cards flow into two balanced columns on lg+, single column below. */}
      <div className="columns-1 gap-5 lg:columns-2 [&>*]:mb-5 [&>*]:break-inside-avoid">
        <section className="widget-card">
        <div className="widget-header flex items-center justify-between">
          <span className="widget-header__label" style={{ fontFamily: MONO }}>
            <span className="widget-header__label--number">01</span>
            {" // CLIENT ACCESS"}
          </span>
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1 text-[12px] font-medium text-[var(--brand-700)] transition hover:bg-[var(--surface-1)]"
          >
            <PlusIcon className="h-3.5 w-3.5" /> Add user
          </button>
        </div>

        <div className="space-y-5 p-6">
          <div className="flex items-start gap-3 rounded-[10px] border border-[var(--border-1)] bg-[var(--surface-1)] p-4">
            <LockClosedIcon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--text-3)]" />
            <p className="text-[13px] leading-relaxed text-[var(--text-3)]">
              The public wiki link is <strong>locked</strong>. Clients sign in with one of the
              email/password accounts below. Gitwork staff signed into Foundry can always view it
              without these credentials.
            </p>
          </div>

          {users.length > 0 && !wikiShared && (
            <div className="flex items-start gap-3 rounded-[10px] border border-amber-300 bg-amber-50 p-4">
              <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <p className="text-[13px] leading-relaxed text-amber-800">
                This wiki isn&apos;t shared yet, so these users <strong>can&apos;t sign in</strong>{" "}
                — the portal login reports &ldquo;no workspace found&rdquo;. Turn on{" "}
                <strong>Share entire wiki</strong> in the Sharing panel below to let them in.
              </p>
            </div>
          )}

          {/* User list */}
          {users.length === 0 ? (
            <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-4 py-8 text-center text-[13px] text-[var(--text-4)]">
              No client users yet. Until you add one, only Gitwork staff can open the link.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border-1)] overflow-hidden rounded-[10px] border border-[var(--border-1)]">
              {users.map((u) => (
                <li key={u.id} className="flex items-center gap-3 bg-white px-4 py-3">
                  <UserCircleIcon className="h-8 w-8 shrink-0 text-[var(--text-4)]" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-[var(--text-1)]">
                      {u.email}
                    </div>
                    <div className="truncate text-[12px] text-[var(--text-4)]">
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
                        className="rounded-[6px] bg-rose-600 px-2.5 py-1 text-[12px] font-medium text-white transition hover:bg-rose-700 disabled:opacity-50"
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(null)}
                        className="rounded-[6px] border border-[var(--border-2)] px-2.5 py-1 text-[12px] text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(u)}
                        title="Edit"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
                      >
                        <PencilSquareIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(u.id)}
                        title="Remove"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-rose-50 hover:text-rose-600"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

        <WikiApiIntakeSettings slug={slug} />

        <WikiSharePanel wiki={wiki} slug={slug} availableSections={availableSections} />

        <WikiAppearanceCard />
      </div>

      {editing && (
        <WikiUserModal
          mode={editing === "new" ? "create" : "edit"}
          user={editing === "new" ? null : editing}
          busy={createUser.isPending || updateUser.isPending}
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
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}


// Appearance — surfaces the shared Light/Dark/System control inside the wiki settings (the same
// preference the header toggle and the rest of Foundry use; synced via localStorage + data-theme).
function WikiAppearanceCard() {
  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label" style={{ fontFamily: MONO }}>
          <span className="widget-header__label--number">04</span>
          {" // APPEARANCE"}
        </span>
      </div>
      <div className="space-y-4 p-6">
        <p className="text-[13px] leading-relaxed text-[var(--text-3)]">
          Switch the wiki between light and dark. This preference is shared across Foundry and the
          public client wiki, and follows your device when set to System.
        </p>
        <ThemeToggle />
      </div>
    </section>
  );
}

function WikiApiIntakeSettings({ slug }: { slug: string }) {
  const { data, isPending } = useCourseIngest(slug, true);
  const setIngest = useSetCourseIngest(slug);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmDisable, setConfirmDisable] = useState(false);

  const token = data?.token ?? null;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const courseEndpoint = token ? `${origin}/api/public/course-requests/${token}` : "";
  const wikiItemsEndpoint = token ? `${origin}/api/public/wiki-items/${token}` : "";
  const intakePagePath = `/app/portal/${slug}/wiki`;
  const example = token
    ? `curl -X POST ${wikiItemsEndpoint} \\\n  -H "Content-Type: application/json" \\\n  -d '{"type":"BUG","title":"Scorecard total is incorrect","description":"Steps to reproduce...","requestedBy":"Big Wedge app","externalRef":"bug_123","priority":"HIGH"}'`
    : "";
  const busy = setIngest.isPending;

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label" style={{ fontFamily: MONO }}>
          <span className="widget-header__label--number">02</span>
          {" // API INTAKE"}
        </span>
      </div>
      <div className="space-y-5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--text-1)]">Client wiki intake API</p>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-4)]">
              Give this client-scoped token to a trusted external system so it can push bugs,
              feedback, tasks, or Wedge course requests into this wiki/client. Bugs, feedback,
              and task requests stay on the Wiki Requests page until an Admin promotes them.
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
          <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-4 py-8 text-center text-[13px] text-[var(--text-4)]">
            Loading intake settings…
          </p>
        ) : !token ? (
          <div className="rounded-[10px] border border-dashed border-[var(--border-2)] px-4 py-8 text-center">
            <p className="mb-3 text-[13px] text-[var(--text-4)]">API intake is off.</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => setIngest.mutate({ enabled: true })}
              className="inline-flex items-center rounded-[6px] bg-[var(--brand-700)] px-4 py-1.5 text-[13px] font-medium text-white transition hover:bg-[var(--brand-800)] disabled:opacity-60"
            >
              {busy ? "Enabling…" : "Enable API intake"}
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="overflow-hidden rounded-[12px] border border-[var(--border-1)] bg-[var(--surface-1)]">
              <div className="grid gap-px bg-[var(--border-1)] md:grid-cols-3">
                {[
                  { label: "1 // CLIENT PUSHES", value: "Bug, feedback, or task JSON" },
                  { label: "2 // FOUNDRY ROUTES", value: "Token locks it to this Wiki" },
                  { label: "3 // TEAM TRIAGES", value: "Wiki Requests → promote later" },
                ].map((step) => (
                  <div key={step.label} className="bg-white p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brand-700)]" style={{ fontFamily: MONO }}>{step.label}</p>
                    <p className="mt-1 text-[13px] font-medium text-[var(--text-1)]">{step.value}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-1)] bg-white px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[var(--text-1)]">Where bugs, feedback, and tasks appear</p>
                  <p className="mt-0.5 text-[12px] text-[var(--text-4)]">
                    Every accepted item appears on the client Wiki <strong>Requests</strong> page first. Clients can add items, but only Admin/Super Admin users can promote them into Dev tasks later.
                  </p>
                </div>
                <a
                  href={intakePagePath}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-[7px] bg-[var(--brand-700)] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[var(--brand-800)]"
                >
                  Open Wiki requests
                  <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {[
                { label: "BUG", title: "Creates a bug card", copy: "Use for defects, regressions, or reproducible issues." },
                { label: "FEEDBACK", title: "Creates a feedback card", copy: "Use for client/customer comments or product suggestions." },
                { label: "TASK", title: "Creates a task card", copy: "Use for small requested work items that need triage." },
              ].map((item) => (
                <div key={item.label} className="rounded-[10px] border border-[var(--border-1)] bg-white p-4">
                  <span className="rounded-full bg-[var(--brand-50)] px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-[var(--brand-700)]">{item.label}</span>
                  <p className="mt-2 text-[13px] font-semibold text-[var(--text-1)]">{item.title}</p>
                  <p className="mt-1 text-[12px] leading-5 text-[var(--text-4)]">{item.copy}</p>
                </div>
              ))}
            </div>

            {[
              { key: "items", label: "Bugs / feedback / tasks", method: "POST", value: wikiItemsEndpoint },
              { key: "courses", label: "Wedge course requests", method: "POST", value: courseEndpoint },
              { key: "check", label: "Connectivity check", method: "GET", value: wikiItemsEndpoint },
            ].map((row) => (
              <div key={row.key}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-4)]">
                    {row.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => void copy(row.key, row.value)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--brand-700)] hover:text-[var(--brand-800)]"
                  >
                    {copied === row.key ? <CheckIcon className="h-3.5 w-3.5" /> : <ClipboardDocumentIcon className="h-3.5 w-3.5" />}
                    {copied === row.key ? "Copied" : "Copy"}
                  </button>
                </div>
                <div className="break-all rounded-[8px] border border-[var(--border-1)] bg-[var(--surface-1)] px-3 py-2 text-[12px] text-[var(--text-2)]" style={{ fontFamily: MONO }}>
                  <span className="text-[var(--text-4)]">{row.method} </span>{row.value}
                </div>
              </div>
            ))}

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-4)]">Example bug push</span>
                <button type="button" onClick={() => void copy("example", example)} className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--brand-700)] hover:text-[var(--brand-800)]">
                  {copied === "example" ? <CheckIcon className="h-3.5 w-3.5" /> : <ClipboardDocumentIcon className="h-3.5 w-3.5" />}
                  {copied === "example" ? "Copied" : "Copy"}
                </button>
              </div>
              <pre className="overflow-x-auto rounded-[8px] border border-[rgba(0,0,0,0.1)] bg-[#0f1115] px-3 py-2.5 text-[11.5px] leading-5 text-[#d6deeb]" style={{ fontFamily: MONO }}>{example}</pre>
              <p className="mt-1.5 text-[11px] leading-5 text-[var(--text-4)]">
                Required: <span style={{ fontFamily: MONO }}>title</span>. Optional: <span style={{ fontFamily: MONO }}>type</span>, <span style={{ fontFamily: MONO }}>description</span>, <span style={{ fontFamily: MONO }}>priority</span>, <span style={{ fontFamily: MONO }}>requestedBy</span>, and <span style={{ fontFamily: MONO }}>externalRef</span>. Send one object or {`{"items":[…]}`} for a batch of up to 200.
              </p>
            </div>

            <div className="rounded-[10px] border border-[var(--border-1)] bg-[var(--surface-1)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-4)]">Clean mapping</p>
              <dl className="mt-3 grid gap-3 text-[12px] md:grid-cols-2">
                <div><dt className="font-semibold text-[var(--text-2)]">title</dt><dd className="text-[var(--text-4)]">Request title shown in the Wiki intake list; the type prefix is only added if promoted to a task.</dd></div>
                <div><dt className="font-semibold text-[var(--text-2)]">description</dt><dd className="text-[var(--text-4)]">Task description for reproduction steps or context.</dd></div>
                <div><dt className="font-semibold text-[var(--text-2)]">priority</dt><dd className="text-[var(--text-4)]">Maps to LOW, MEDIUM, or HIGH on the task.</dd></div>
                <div><dt className="font-semibold text-[var(--text-2)]">externalRef</dt><dd className="text-[var(--text-4)]">Stored for dedupe so repeat pushes do not create duplicates.</dd></div>
              </dl>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-[var(--border-1)] pt-4">
              {confirmDisable ? (
                <>
                  <span className="text-[12px] text-[var(--text-3)]">Disable intake? The current token stops working immediately.</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setConfirmDisable(false)} className="rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-1.5 text-[13px] font-medium text-[var(--text-2)] hover:bg-[var(--surface-1)]">Keep</button>
                    <button type="button" disabled={busy} onClick={() => { setIngest.mutate({ enabled: false }); setConfirmDisable(false); }} className="rounded-[6px] bg-red-600 px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-red-700 disabled:opacity-60">Disable</button>
                  </div>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setConfirmDisable(true)} className="text-[12px] font-medium text-red-600 hover:text-red-700">Disable intake</button>
                  <button type="button" disabled={busy} onClick={() => setIngest.mutate({ enabled: true, rotate: true })} className="rounded-[6px] border border-[var(--border-2)] bg-white px-3.5 py-1.5 text-[13px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-60">
                    {busy ? "Working…" : "Rotate token"}
                  </button>
                </>
              )}
            </div>
          </div>
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
      {/* Smart preview — the actual unfurl card recipients will see. */}
      <div className="overflow-hidden rounded-[8px] border border-[var(--border-1)] bg-[var(--surface-1)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${href}/opengraph-image`}
          alt="Link preview"
          loading="lazy"
          className="block aspect-[1200/630] w-full object-cover"
        />
      </div>
      <div className="flex items-center gap-2">
      <p
        className="min-w-0 flex-1 truncate rounded-[7px] border border-[var(--border-1)] bg-[var(--surface-1)] px-2.5 py-1.5 text-[11px] text-[var(--text-3)]"
        style={{ fontFamily: MONO }}
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
        className="inline-flex shrink-0 items-center justify-center rounded-[7px] border border-[var(--border-2)] bg-white px-2.5 py-1.5 text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
        title="Open"
      >
        <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
      </a>
      </div>
    </div>
  );
}

function WikiSharePanel({
  wiki,
  slug,
  availableSections,
}: {
  wiki: WikiDTO;
  slug: string;
  availableSections: WikiSection[];
}) {
  const setShare = useSetWikiShare(slug);
  const sectionShare = useSetWikiSectionShare(slug);
  const [copied, setCopied] = useState<string | null>(null);

  const wikiOn = wiki.shareEnabled && Boolean(wiki.shareToken);
  const pageShares = (wiki.pageShares ?? {}) as Record<string, string>;
  const shareable = availableSections.filter(
    (s): s is WikiSection => Boolean(SHARE_SECTION_LABELS[s]),
  );

  async function copy(key: string, href: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${href}`);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label" style={{ fontFamily: MONO }}>
          <span className="widget-header__label--number">03</span>
          {" // SHARING"}
        </span>
      </div>

      <div className="space-y-5 p-6">
        {/* Global */}
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <GlobeAltIcon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--text-3)]" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--text-1)]">Share entire wiki</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-4)]">
                  One public link covering every page — Dashboard, Timeline, docs, changelog &amp;
                  client sections.
                </p>
              </div>
            </div>
            <ShareToggle
              on={wikiOn}
              disabled={setShare.isPending}
              onClick={() => void setShare.mutateAsync(!wikiOn)}
            />
          </div>
          {wikiOn && wiki.shareToken && (
            <ShareLinkRow
              href={`/wiki/${slug}/${wiki.shareToken}`}
              copied={copied === "wiki"}
              onCopy={() => copy("wiki", `/wiki/${slug}/${wiki.shareToken}`)}
            />
          )}
        </div>

        <div className="h-px bg-[var(--border-1)]" />

        {/* Individual pages */}
        <div>
          <p
            className="mb-3 text-[11px] uppercase tracking-[0.06em] text-[var(--text-4)]"
            style={{ fontFamily: MONO }}
          >
            Or share individual pages
          </p>
          {shareable.length === 0 ? (
            <p className="text-[13px] text-[var(--text-4)]">No shareable pages yet.</p>
          ) : (
            <ul className="space-y-3">
              {shareable.map((section) => {
                const token = pageShares[section];
                const on = Boolean(token);
                return (
                  <li key={section}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[13px] text-[var(--text-2)]">
                        {SHARE_SECTION_LABELS[section]}
                      </span>
                      {wikiOn ? (
                        <span className="text-[11px] text-[var(--text-4)]">
                          Included in the full-wiki link
                        </span>
                      ) : (
                        <ShareToggle
                          on={on}
                          disabled={sectionShare.isPending}
                          onClick={() =>
                            void sectionShare.mutateAsync({ section, enabled: !on })
                          }
                        />
                      )}
                    </div>
                    {!wikiOn && on && token && (
                      <ShareLinkRow
                        href={`/wiki/${slug}/${token}`}
                        copied={copied === section}
                        onCopy={() => copy(section, `/wiki/${slug}/${token}`)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function WikiUserModal({
  mode,
  user,
  busy,
  onClose,
  onSubmit,
}: {
  mode: "create" | "edit";
  user: WikiUserSummary | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: { email: string; name: string; password?: string }) => Promise<void>;
}) {
  const [email, setEmail] = useState(user?.email ?? "");
  const [name, setName] = useState(user?.name ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleGenerate() {
    const pw = generatePassword();
    setPassword(pw);
    setReveal(true);
    setCopied(false);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the field is visible to copy manually */
    }
  }

  async function handleSave() {
    setError(null);
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    if (mode === "create" && password.trim().length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (mode === "edit" && password.length > 0 && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    try {
      await onSubmit({ email: email.trim(), name: name.trim(), password: password || undefined });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-[16px] border border-[rgba(0,0,0,0.08)] bg-white p-6 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          className="text-lg text-[var(--text-1)]"
          style={{ fontFamily: "var(--font-serif), Georgia, serif" }}
        >
          {mode === "create" ? "Add client user" : "Edit user"}
        </h2>
        <div className="mt-5 space-y-4">
          <div>
            <label className={labelCls} style={{ fontFamily: MONO }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls} style={{ fontFamily: MONO }}>
              Name (optional)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              className={inputCls}
            />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className={labelCls.replace("mb-1.5 ", "")} style={{ fontFamily: MONO }}>
                Password
              </label>
              <button
                type="button"
                onClick={handleGenerate}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--brand-700)] transition hover:text-[var(--brand-800)]"
              >
                <ArrowPathIcon className="h-3.5 w-3.5" />
                {mode === "edit" ? "Reset & generate" : "Generate"}
              </button>
            </div>
            <div className="relative">
              <input
                type={reveal ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  mode === "edit" ? "Leave blank to keep current" : "At least 8 characters"
                }
                autoComplete="new-password"
                className={`${inputCls} ${password ? "pr-16" : ""}`}
                style={reveal ? { fontFamily: MONO, letterSpacing: "0.04em" } : undefined}
              />
              {password && (
                <div className="absolute inset-y-0 right-1.5 flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setReveal((v) => !v)}
                    title={reveal ? "Hide" : "Show"}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
                  >
                    {reveal ? (
                      <EyeSlashIcon className="h-4 w-4" />
                    ) : (
                      <EyeIcon className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleCopy}
                    title="Copy password"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
                  >
                    {copied ? (
                      <CheckIcon className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <ClipboardDocumentIcon className="h-4 w-4" />
                    )}
                  </button>
                </div>
              )}
            </div>
            {mode === "edit" && (
              <p className="mt-1 text-[11px] text-[var(--text-4)]">
                Generating a new password replaces the old one when you save — send the client the
                new one.
              </p>
            )}
          </div>
          {error && <p className="text-[13px] text-rose-600">{error}</p>}
        </div>
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[8px] border border-[var(--border-2)] px-4 py-2 text-sm text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="rounded-[8px] bg-[var(--brand-600)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--brand-700)] disabled:opacity-50"
          >
            {busy ? "Saving…" : mode === "create" ? "Add user" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
