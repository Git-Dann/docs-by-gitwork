"use client";

/**
 * Brand source marks for the brief — the little logos next to each update and in the
 * footer credit, mirroring Dia's "using your [Slack] [Google Calendar] …" treatment.
 * Real brand SVGs where we have them (Slack / Gmail / Google Calendar / Drive), and
 * simple currentColor glyphs for Foundry-internal sources (Tasks, Scribe).
 */

export type SourceKind =
  | "slack"
  | "gmail"
  | "gcal"
  | "gdrive"
  | "scribe"
  | "tasks"
  | "calendar";

/** Map a footer source label ("Google Calendar", "Slack", "Tasks") → an icon kind. */
export function sourceKindFromLabel(label: string): SourceKind {
  const l = label.toLowerCase();
  if (l.includes("slack")) return "slack";
  if (l.includes("calendar")) return "gcal";
  if (l.includes("gmail") || l.includes("mail")) return "gmail";
  if (l.includes("drive")) return "gdrive";
  if (l.includes("task")) return "tasks";
  if (l.includes("scribe") || l.includes("meeting")) return "scribe";
  return "tasks";
}

export function SourceIcon({ kind, className }: { kind: SourceKind; className?: string }) {
  const cls = className ?? "h-4 w-4";
  switch (kind) {
    case "slack":
      return (
        <svg viewBox="0 0 127 127" className={cls} aria-hidden focusable="false">
          <path d="M27.2 80c0 7.3-5.9 13.2-13.2 13.2C6.7 93.2.8 87.3.8 80c0-7.3 5.9-13.2 13.2-13.2h13.2V80zm6.6 0c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2v33c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V80z" fill="#E01E5A" />
          <path d="M47 27c-7.3 0-13.2-5.9-13.2-13.2C33.8 6.5 39.7.6 47 .6c7.3 0 13.2 5.9 13.2 13.2V27H47zm0 6.7c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H13.9C6.6 60.1.7 54.2.7 46.9c0-7.3 5.9-13.2 13.2-13.2H47z" fill="#36C5F0" />
          <path d="M99.9 46.9c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H99.9V46.9zm-6.6 0c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V13.8C66.9 6.5 72.8.6 80.1.6c7.3 0 13.2 5.9 13.2 13.2v33.1z" fill="#2EB67D" />
          <path d="M80.1 99.8c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V99.8h13.2zm0-6.6c-7.3 0-13.2-5.9-13.2-13.2 0-7.3 5.9-13.2 13.2-13.2h33.1c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H80.1z" fill="#ECB22E" />
        </svg>
      );
    case "gmail":
      return (
        <svg viewBox="52 42 88 66" className={cls} aria-hidden focusable="false">
          <path fill="#4285f4" d="M58 108h14V74L52 59v43c0 3.32 2.69 6 6 6" />
          <path fill="#34a853" d="M120 108h14c3.32 0 6-2.69 6-6V59l-20 15" />
          <path fill="#fbbc04" d="M120 48v26l20-15v-8c0-7.42-8.47-11.65-14.4-7.2" />
          <path fill="#ea4335" d="M72 74V48l24 18 24-18v26L96 92" />
          <path fill="#c5221f" d="M52 51v8l20 15V48l-5.6-4.2c-5.94-4.45-14.4-.22-14.4 7.2" />
        </svg>
      );
    case "gcal":
      return (
        <svg viewBox="0 0 200 200" className={cls} aria-hidden focusable="false">
          <path fill="#fff" d="M148.882 43.618l-47.368-5.263-57.895 5.263L38.355 96.25l5.263 52.632 52.632 6.579 52.632-6.579 5.263-53.947z" />
          <path fill="#1a73e8" d="M65.211 125.276c-3.934-2.658-6.658-6.539-8.145-11.671l9.132-3.763c.829 3.158 2.276 5.605 4.342 7.342 2.053 1.737 4.553 2.592 7.474 2.592 2.987 0 5.553-.908 7.697-2.724s3.224-4.132 3.224-6.934c0-2.868-1.132-5.211-3.395-7.026s-5.105-2.724-8.5-2.724h-5.276v-9.039H76.5c2.921 0 5.382-.789 7.382-2.368 2-1.579 3-3.737 3-6.487 0-2.447-.895-4.395-2.684-5.855s-4.053-2.197-6.803-2.197c-2.684 0-4.816.711-6.395 2.145s-2.724 3.197-3.447 5.276l-9.039-3.763c1.197-3.395 3.395-6.395 6.618-8.987 3.224-2.592 7.342-3.895 12.342-3.895 3.697 0 7.026.711 9.974 2.145 2.947 1.434 5.263 3.421 6.934 5.947 1.671 2.539 2.5 5.382 2.5 8.539 0 3.224-.776 5.947-2.329 8.184-1.553 2.237-3.461 3.947-5.724 5.145v.539c2.987 1.25 5.421 3.158 7.342 5.724 1.908 2.566 2.868 5.632 2.868 9.211s-.908 6.776-2.724 9.579c-1.816 2.803-4.329 5.013-7.513 6.618-3.197 1.605-6.789 2.421-10.776 2.421-4.61.013-8.873-1.316-12.807-3.974z" />
          <path fill="#1a73e8" d="M121.25 79.961l-9.974 7.25-5.013-7.605 17.987-12.974h6.895v61.197h-9.895z" />
          <path fill="#ea4335" d="M148.882 196.25l47.368-47.368-23.684-10.526-23.684 10.526-10.526 23.684z" />
          <path fill="#34a853" d="M33.092 172.566l10.526 23.684h105.263v-47.368H43.618z" />
          <path fill="#4285f4" d="M12.039-3.75C3.316-3.75-3.75 3.316-3.75 12.039v136.842l23.684 10.526 23.684-10.526V43.618h105.263l10.526-23.684L148.882-3.75z" />
          <path fill="#188038" d="M-3.75 148.882v31.579c0 8.724 7.066 15.789 15.789 15.789h31.579v-47.368z" />
          <path fill="#fbbc04" d="M148.882 43.618v105.263h47.368V43.618l-23.684-10.526z" />
          <path fill="#1967d2" d="M196.25 43.618V12.039c0-8.724-7.066-15.789-15.789-15.789h-31.579v47.368z" />
        </svg>
      );
    case "gdrive":
      return (
        <svg viewBox="0 0 87.3 78" className={cls} aria-hidden focusable="false">
          <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
          <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" fill="#00ac47" />
          <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
          <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
          <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
          <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
        </svg>
      );
    case "scribe":
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="none" aria-hidden focusable="false">
          <path d="M6 3.5h9L19 7.5v13H6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M9 11h7M9 14.5h7M9 17.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "tasks":
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="none" aria-hidden focusable="false">
          <rect x="3.5" y="4.5" width="7" height="15" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <rect x="13.5" y="4.5" width="7" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "calendar":
    default:
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="none" aria-hidden focusable="false">
          <rect x="3.5" y="5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
  }
}
