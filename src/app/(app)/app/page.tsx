import Link from "next/link";
import { AppShell } from "@/components/app-shell";

const cards = [
  {
    title: "Create proposal",
    body: "Start a structured proposal with timeline, costing, and CTA blocks.",
    href: "/app/proposals",
    action: "Open proposals",
  },
  {
    title: "Template foundation",
    body: "Manage reusable document templates and section structures.",
    href: "/app/templates",
    action: "View templates",
  },
  {
    title: "Workspace settings",
    body: "Save default company profile details and internal preferences.",
    href: "/app/settings",
    action: "Open settings",
  },
];

export default function AppDashboardPage() {
  return (
    <AppShell
      title="Dashboard"
      subtitle="Docs by Gitwork. Proposal generation optimized for internal delivery teams."
    >
      <section className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <article key={card.title} className="rounded-xl border border-[var(--border-1)] bg-white p-4">
            <h2 className="text-base font-semibold">{card.title}</h2>
            <p className="mt-2 text-sm text-[var(--text-2)]">{card.body}</p>
            <Link
              href={card.href}
              className="mt-4 inline-flex h-9 items-center rounded-md border border-[var(--border-1)] px-3 text-xs font-medium text-[var(--text-2)]"
            >
              {card.action}
            </Link>
          </article>
        ))}
      </section>
    </AppShell>
  );
}
