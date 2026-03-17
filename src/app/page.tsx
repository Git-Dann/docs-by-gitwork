import Link from "next/link";

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--surface-0)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(17,95,160,0.08),_transparent_45%),linear-gradient(180deg,_#f8fbfd_0%,_#f4f7f9_100%)]" />
      <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-16">
        <span className="inline-flex w-fit rounded-full border border-[var(--border-1)] bg-white px-3 py-1 text-xs font-semibold tracking-[0.12em] text-[var(--text-3)] uppercase">
          Proposal Platform
        </span>

        <h1 className="mt-6 max-w-3xl text-4xl leading-tight font-semibold tracking-tight text-[var(--text-1)] sm:text-5xl">
          Docs by Gitwork
          <br />
          Structured proposals for serious delivery teams.
        </h1>

        <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--text-2)] sm:text-lg">
          Create, review, and export polished proposal documents from a guided editor with live preview, timeline, costing, CTAs, and supporting links.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/app/proposals"
            className="inline-flex h-11 items-center rounded-md bg-[var(--brand-600)] px-4 text-sm font-medium text-white hover:bg-[var(--brand-700)]"
          >
            Open app
          </Link>
          <Link
            href="/preview"
            className="inline-flex h-11 items-center rounded-md border border-[var(--border-1)] bg-white px-4 text-sm font-medium text-[var(--text-2)]"
          >
            Preview sample
          </Link>
        </div>
      </main>
    </div>
  );
}
