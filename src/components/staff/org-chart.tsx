"use client";

/**
 * Staff → People → Org chart (docs/hr-platform.md).
 *
 * Gitwork has no list of who manages whom: the admins are the managers. So the chart lays
 * itself out by role (`orgTiers`):
 *   1. Leadership (Super Admins)
 *   2. Admins
 *   3. Everyone else, under the same headings as the cards (Staff, Developers, Guests, No login).
 * The tiers are joined by a line down the middle. Someone whose manager IS set on their profile
 * hangs under that person as a branch, with lines, so a real reporting line always wins over
 * the default. Nobody has to fill anything in for the chart to make sense.
 *
 * The first version drew only from the manager field. With none set, it was a plain list.
 *
 * A manager whose reports are all leaves, and who has more than MAX_ROW of them, lists them in a
 * column rather than a row, so one lead's twelve developers don't make it screens wide.
 */

import Link from "next/link";
import { Fragment, useEffect, useRef } from "react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/format";
import { orgTiers, type OrgNode, type StaffPerson } from "@/lib/staff";

const MAX_ROW = 4;

function displayName(p: StaffPerson): string {
  return p.preferredName || p.name;
}

function NodeCard({ person, reports, basePath, subtitle }: { person: StaffPerson; reports: number; basePath: string; subtitle: (p: StaffPerson) => string }) {
  const body = (
    <>
      <Avatar src={person.avatarUrl} name={person.name} size={30} />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[13px] font-medium text-[var(--text-1)]" title={person.name}>
          {displayName(person)}
        </span>
        <span className="block truncate text-[11.5px] text-[var(--text-3)]" title={subtitle(person)}>
          {subtitle(person)}
        </span>
      </span>
      {reports ? (
        <span
          className="shrink-0 rounded-[4px] bg-[var(--surface-1)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-3)]"
          title={`${reports} report${reports === 1 ? "" : "s"}`}
        >
          {reports}
        </span>
      ) : null}
    </>
  );
  const cls =
    "relative z-[1] flex w-[200px] items-center gap-2.5 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2.5 py-2 transition-colors";
  return person.recordId ? (
    <Link href={`${basePath}/${person.recordId}`} className={cn(cls, "hover:border-[var(--brand-400)]")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Branch({ node, basePath, subtitle }: { node: OrgNode; basePath: string; subtitle: (p: StaffPerson) => string }) {
  const leavesOnly = node.reports.length > MAX_ROW && node.reports.every((r) => r.reports.length === 0);
  return (
    <li>
      <NodeCard person={node.person} reports={node.reports.length} basePath={basePath} subtitle={subtitle} />
      {node.reports.length === 0 ? null : leavesOnly ? (
        <div className="org-stack">
          {node.reports.map((r) => (
            <NodeCard key={r.person.key} person={r.person} reports={0} basePath={basePath} subtitle={subtitle} />
          ))}
        </div>
      ) : (
        <ul>
          {node.reports.map((r) => (
            <Branch key={r.person.key} node={r} basePath={basePath} subtitle={subtitle} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function OrgChart({
  tree,
  basePath,
  subtitle,
}: {
  tree: OrgNode[];
  basePath: string;
  /** The line under a name: the same one the cards use. */
  subtitle: (p: StaffPerson) => string;
}) {
  const tiers = orgTiers(tree);
  // Wider than the card (a phone, a long branch): open on the middle, where the chart is
  // centred, rather than its left edge.
  const scroller = useRef<HTMLDivElement>(null);
  const shape = tree.map((n) => n.person.key).join(",");
  useEffect(() => {
    const el = scroller.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [shape]);

  if (!tiers.length) return null;
  return (
    <div className="space-y-3">
      {/* Scrolls sideways in its own frame if a branch is wider than the card: `.widget-card`
          is overflow-hidden, so without a scroller the edges would be cut off. */}
      <div ref={scroller} className="overflow-x-auto pb-2">
        <div className="flex min-w-full flex-col items-center">
          {tiers.map((tier, i) => (
            <Fragment key={tier.id}>
              {i > 0 ? <span aria-hidden className="h-6 w-px bg-[var(--border-1)]" /> : null}
              <section aria-label={tier.label} className="flex w-full flex-col items-center">
                <p className="widget-data-label pb-2 text-[var(--text-4)]">
                  {tier.label} · {tier.nodes.length}
                </p>
                <div className="flex flex-wrap items-start justify-center gap-3">
                  {tier.nodes.map((n) =>
                    n.reports.length ? (
                      <div key={n.person.key} className="org-tree">
                        <ul>
                          <Branch node={n} basePath={basePath} subtitle={subtitle} />
                        </ul>
                      </div>
                    ) : (
                      <NodeCard key={n.person.key} person={n.person} reports={0} basePath={basePath} subtitle={subtitle} />
                    ),
                  )}
                </div>
              </section>
            </Fragment>
          ))}
        </div>
      </div>
      <p className="text-center font-mono text-[11px] text-[var(--text-4)]">
        Placed by role. Set someone&apos;s manager on their profile to draw a line to them.
      </p>
    </div>
  );
}
