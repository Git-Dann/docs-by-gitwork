"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  CHAPTERS,
  GUIDELINES_VERSION,
  PAGE_COUNT,
  PAGES,
  fieldText,
  pageNumber,
  type GuidelineChapter,
  type GuidelinePage,
  type VisualId,
} from "@/lib/guidelines/content";
import {
  AFTERDESK,
  AfterDeskIcon,
  AfterDeskLogo,
  FONT,
  FOUNDRY,
  FoundryAppIcon,
  FoundryWordmark,
  GW,
  GitworkRoundel,
  GitworkWordmark,
  LEISURE_TECH,
  LeisureTechLogo,
} from "./brand-marks";
import { GuideText, useGuide } from "./guide-context";

/*
 * Every slide is drawn at 1600 x 900 (SlideFrame scales it), so sizes here are design pixels.
 * The palette and type are Gitwork's own (BG-2026-01), not the app's tokens: this is the brand
 * book, and it has to look like the brand on every screen and in print.
 */

const mono = (size: number, color: string = GW.muted, extra: CSSProperties = {}): CSSProperties => ({
  fontFamily: FONT.mono,
  fontSize: size,
  fontWeight: 500,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color,
  ...extra,
});

const display = (size: number, extra: CSSProperties = {}): CSSProperties => ({
  fontFamily: FONT.display,
  fontSize: size,
  fontWeight: 700,
  letterSpacing: "-0.02em",
  lineHeight: 1.05,
  ...extra,
});

const body = (size: number, color: string = GW.text, extra: CSSProperties = {}): CSSProperties => ({
  fontFamily: FONT.body,
  fontSize: size,
  lineHeight: 1.55,
  color,
  ...extra,
});

/** The slide's own surface. */
function Slide({ ground, children }: { ground: string; children: ReactNode }) {
  return (
    <div
      className="gl-slide"
      style={{ position: "relative", width: 1600, height: 900, overflow: "hidden", background: ground, color: GW.text }}
    >
      {children}
    </div>
  );
}

/** "From prompt to production." with the last word as the one accent phrase. */
function WithAccent({ text, accent }: { text: string; accent: string }) {
  const m = text.match(/^([\s\S]*\s)?(\S+?)([.!?]?)$/);
  if (!m) return <>{text}</>;
  return (
    <>
      {m[1] ?? ""}
      <span style={{ fontStyle: "italic", color: accent }}>{m[2]}</span>
      {m[3]}
    </>
  );
}

// ── Cover, contents, chapter ──────────────────────────────────────────────────

export function CoverSlide({ page }: { page: GuidelinePage }) {
  const { overrides, editing } = useGuide();
  return (
    <Slide ground={GW.ink}>
      <div style={{ position: "absolute", inset: "72px 96px", display: "flex", flexDirection: "column", color: GW.paper }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <GitworkRoundel size={56} />
          <GitworkWordmark height={40} variant="paper" />
        </div>
        <div style={{ marginTop: "auto", marginBottom: 72 }}>
          <div style={mono(15, GW.paper, { fontWeight: 600, letterSpacing: "0.2em" })}>
            Brand guidelines · {GUIDELINES_VERSION}
          </div>
          {editing ? (
            <GuideText page={page} field="title" singleLine style={display(128, { marginTop: 28, maxWidth: 1180 })} />
          ) : (
            <h1 style={display(128, { marginTop: 28, maxWidth: 1180 })}>
              <WithAccent text={fieldText(overrides, page, "title")} accent={GW.signal} />
            </h1>
          )}
          <GuideText page={page} field="note" style={body(26, GW.inkMuted, { marginTop: 32, maxWidth: 820, fontWeight: 300 })} />
        </div>
        <div style={{ display: "flex", gap: 88, paddingTop: 28, borderTop: `1px solid ${GW.inkRule}` }}>
          {[
            ["Owner", "Gitwork Group Ltd"],
            ["Version", GUIDELINES_VERSION],
            ["Covers", "Gitwork and its products"],
            ["Pages", String(PAGE_COUNT)],
          ].map(([k, v]) => (
            <div key={k}>
              <div style={mono(12, GW.inkMuted, { letterSpacing: "0.16em" })}>{k}</div>
              <div style={body(19, GW.paper, { marginTop: 8, fontWeight: 500 })}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </Slide>
  );
}

export function ContentsSlide() {
  const { goTo, overrides } = useGuide();
  const chapters = CHAPTERS.filter((c) => c.number !== "00");
  return (
    <Slide ground={GW.paper}>
      <PageHead label="Contents" />
      <div style={{ position: "absolute", left: 80, right: 80, top: 150 }}>
        <h2 style={display(68)}>Contents</h2>
        <div style={{ marginTop: 48, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "repeat(4, auto)", gridAutoFlow: "column", columnGap: 72 }}>
          {chapters.map((c) => {
            const first = PAGES.find((p) => p.chapter.id === c.id)!.index;
            const last = first + c.pages.length - 1;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => goTo(c.id)}
                className="gl-link"
                style={{
                  display: "grid",
                  gridTemplateColumns: "72px 1fr auto",
                  alignItems: "baseline",
                  padding: "22px 0",
                  borderBottom: `1px solid ${GW.paperRule}`,
                  textAlign: "left",
                }}
              >
                <span style={mono(15, GW.signal, { fontWeight: 600 })}>{c.number}</span>
                <span style={display(36)}>{fieldText(overrides, c.pages[0], "title")}</span>
                <span style={mono(13)}>
                  p. {pageNumber(first)} to {pageNumber(last)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <PageFoot index={1} />
    </Slide>
  );
}

const CHAPTER_ACTIONS: Record<string, { label: string; href: string; download?: string }> = {
  logo: { label: "Download the wordmark", href: "/email/gitwork-wordmark-ink.png", download: "gitwork-wordmark-ink.png" },
  products: { label: "Download the Foundry logo (SVG)", href: "/foundry-logo.svg", download: "foundry-logo.svg" },
};

export function ChapterSlide({ page, chapter }: { page: GuidelinePage; chapter: GuidelineChapter }) {
  const { goTo } = useGuide();
  const total = CHAPTERS.length - 1;
  const action = CHAPTER_ACTIONS[chapter.id];
  return (
    <Slide ground={GW.signal}>
      <div style={{ position: "absolute", inset: "64px 80px", color: GW.white, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div style={mono(14, GW.white, { lineHeight: 1.6 })}>
            Gitwork
            <br />
            Brand guidelines
          </div>
          <div style={mono(14, GW.white, { lineHeight: 1.6, textAlign: "right" })}>
            Chapter {chapter.number}
            <br />
            of {String(total).padStart(2, "0")}
          </div>
        </div>
        <div style={{ marginTop: 120, display: "flex", alignItems: "baseline", gap: 44 }}>
          <span style={display(150, { fontWeight: 400 })}>{chapter.number}</span>
          <div style={{ minWidth: 0 }}>
            <GuideText page={page} field="title" as="h2" singleLine style={display(170)} />
            <GuideText page={page} field="note" style={body(28, GW.white, { marginTop: 26, maxWidth: 900, lineHeight: 1.4 })} />
            {action ? (
              <a
                href={action.href}
                download={action.download}
                className="gl-print-hide"
                style={{
                  display: "inline-block",
                  marginTop: 36,
                  background: GW.white,
                  color: GW.ink,
                  fontFamily: FONT.body,
                  fontWeight: 600,
                  fontSize: 18,
                  padding: "15px 28px",
                  borderRadius: 999,
                }}
              >
                {action.label}
              </a>
            ) : null}
          </div>
        </div>
        <div style={{ marginTop: "auto", borderTop: "1px solid rgba(255,255,255,0.35)", paddingTop: 28, display: "flex", flexWrap: "wrap", gap: 12 }}>
          {chapter.pages.slice(1).map((p) => {
            const index = PAGES.find((x) => x.page.id === p.id)!.index;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => goTo(p.id)}
                className="gl-chip"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 18px",
                  borderRadius: 999,
                  background: "rgba(12, 12, 24, 0.18)",
                  color: GW.white,
                  fontFamily: FONT.body,
                  fontSize: 17,
                  fontWeight: 500,
                }}
              >
                <span style={mono(13, GW.white)}>{pageNumber(index)}</span>
                {p.title}
              </button>
            );
          })}
        </div>
      </div>
    </Slide>
  );
}

// ── Content page ──────────────────────────────────────────────────────────────

function PageHead({ label }: { label: string }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 80,
        right: 80,
        top: 52,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingBottom: 18,
        borderBottom: `1px solid ${GW.paperRule}`,
      }}
    >
      <GitworkRoundel size={34} />
      <div style={mono(13)}>
        {GUIDELINES_VERSION} · {label}
      </div>
    </div>
  );
}

function PageFoot({ index }: { index: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 80,
        right: 80,
        bottom: 40,
        display: "flex",
        justifyContent: "space-between",
        ...mono(12),
      }}
    >
      <span>gitwork.co.uk</span>
      <span>
        {pageNumber(index)} / {pageNumber(PAGE_COUNT - 1)}
      </span>
    </div>
  );
}

export function ContentSlide({ page, chapter, index }: { page: GuidelinePage; chapter: GuidelineChapter; index: number }) {
  return (
    <Slide ground={GW.paper}>
      <PageHead label={`${chapter.number} ${chapter.title}`} />
      <div style={{ position: "absolute", left: 80, right: 80, top: 140 }}>
        <GuideText page={page} field="title" as="h2" singleLine style={display(64)} />
        <GuideText page={page} field="subtitle" singleLine style={body(22, GW.muted, { marginTop: 10 })} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 80,
          right: 80,
          top: 290,
          bottom: 92,
          display: "grid",
          gridTemplateColumns: "360px 1fr",
          gap: 64,
        }}
      >
        <div style={{ borderLeft: `2px solid ${GW.ink}`, paddingLeft: 26 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, ...mono(13, GW.text, { fontWeight: 600 }) }}>
            <span style={{ width: 10, height: 10, background: GW.signal }} />
            Note
          </div>
          <GuideText page={page} field="note" style={body(19, GW.text, { marginTop: 16, lineHeight: 1.6 })} />
        </div>
        <div style={{ position: "relative", minWidth: 0, minHeight: 0 }}>{page.visual ? <Visual id={page.visual} /> : null}</div>
      </div>
      <PageFoot index={index} />
    </Slide>
  );
}

// ── Shared pieces for the visuals ────────────────────────────────────────────

function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: GW.white, border: `1px solid ${GW.paperRule}`, borderRadius: 14, padding: "24px 26px", ...style }}>
      {children}
    </div>
  );
}

function Caption({ children, color = GW.muted }: { children: ReactNode; color?: string }) {
  return <div style={mono(12, color, { letterSpacing: "0.16em" })}>{children}</div>;
}

function Badge({ children, tone = "ink" }: { children: ReactNode; tone?: "ink" | "signal" | "tint" | "ghost" }) {
  const tones: Record<string, CSSProperties> = {
    ink: { background: GW.ink, color: GW.paper },
    signal: { background: GW.signal, color: GW.white },
    tint: { background: GW.signalTint, color: GW.signal },
    ghost: { background: "transparent", color: "currentColor", border: `1px solid ${GW.paperRule}` },
  };
  return (
    <span
      style={{
        display: "inline-block",
        ...mono(12, undefined, { fontWeight: 600, letterSpacing: "0.16em" }),
        padding: "8px 14px",
        borderRadius: 999,
        ...tones[tone],
      }}
    >
      {children}
    </span>
  );
}

/** A small "do / don't" verdict mark: the arrow for do, a struck circle for don't. */
function Verdict({ ok }: { ok: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        ...mono(12, ok ? GW.signal : GW.muted, { fontWeight: 600 }),
      }}
    >
      <span
        aria-hidden
        style={{
          width: 20,
          height: 20,
          borderRadius: 999,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: ok ? GW.signal : "transparent",
          border: ok ? "none" : `1.5px solid ${GW.muted}`,
          color: GW.white,
          fontSize: 12,
          letterSpacing: 0,
        }}
      >
        {ok ? "→" : <span style={{ width: 10, height: 1.5, background: GW.muted, transform: "rotate(-45deg)" }} />}
      </span>
      {ok ? "Do" : "Don't"}
    </span>
  );
}

function ArrowList({ items, size = 19, color = GW.text }: { items: ReactNode[]; size?: number; color?: string }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {items.map((item, i) => (
        <li key={i} style={{ position: "relative", paddingLeft: 32, marginBottom: 14, ...body(size, color, { lineHeight: 1.45 }) }}>
          <span aria-hidden style={{ position: "absolute", left: 0, top: 0, color: GW.signal, fontWeight: 500 }}>
            →
          </span>
          {item}
        </li>
      ))}
    </ul>
  );
}

const fill: CSSProperties = { position: "absolute", inset: 0 };

// ── The visuals ───────────────────────────────────────────────────────────────

function Visual({ id }: { id: VisualId }) {
  const V = VISUALS[id];
  return <V />;
}

const OFFERS = [
  { name: "Launch Pad", price: "From £4,995", line: "Finish your vibe-coded app." },
  { name: "MVP Sprint", price: "From £25,000", line: "Idea to MVP in 4 to 6 weeks." },
  { name: "Greenfield Build", price: "From £15,000/month", line: "Embedded squads." },
  { name: "Care Plan", price: "From £1,500/month", line: "Available across all tiers." },
];

const TAGLINES = [
  "From prompt to production.",
  "Built in the AI era, shipped by humans.",
  "AI got you to a prototype. We get you to production.",
  "Fixed scope. Fixed price. Fixed timeline.",
];

const MODULES = [
  ["Pulse", "Production-readiness checks for a site, an app or a repository."],
  ["Care", "Client support, every channel in one queue."],
  ["Docs", "Proposals, contracts and decks, shared and signed."],
  ["Code", "Developer vetting and hiring."],
  ["Portal", "Clients, their tasks, their wiki and their delivery."],
  ["Studio", "On-brand social and app store assets."],
  ["Provenance", "Signed, expiring attestations from a Pulse scan."],
] as const;

function Positioning() {
  return (
    <div style={{ ...fill, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ flex: 1, background: GW.ink, color: GW.paper, borderRadius: 14, padding: "48px 52px", display: "flex", flexDirection: "column" }}>
        <Caption color={GW.inkMuted}>What we do</Caption>
        <div style={display(58, { marginTop: 22, lineHeight: 1.08, maxWidth: 820 })}>
          AI got you to a prototype. We get you to <span style={{ fontStyle: "italic", color: GW.signal }}>production</span>.
        </div>
        <div style={{ marginTop: "auto", ...mono(13, GW.inkMuted) }}>Global build capacity, UK quality control.</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
        {["Fixed scope.", "Fixed price.", "Fixed timeline."].map((t, i) => (
          <Card key={t}>
            <Caption>{`0${i + 1}`}</Caption>
            <div style={display(32, { marginTop: 12 })}>{t}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Voice() {
  const rows = [
    ["AI got you to a prototype. We get you to production.", "Leveraging cutting-edge AI to unlock transformative outcomes."],
    ["Fixed scope. Fixed price. Fixed timeline.", "We are passionate about your journey."],
    ["Your Lovable build stops at auth. Here is what it takes to ship it.", "World-class engineering excellence, delivered."],
  ];
  return (
    <div style={fill}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, paddingBottom: 14, borderBottom: `1px solid ${GW.paperRule}` }}>
        <Verdict ok />
        <Verdict ok={false} />
      </div>
      {rows.map(([good, bad]) => (
        <div key={good} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, padding: "24px 0", borderBottom: `1px solid ${GW.paperRule}` }}>
          <div style={display(26, { lineHeight: 1.25 })}>{good}</div>
          <div style={body(20, GW.muted, { textDecoration: "line-through", textDecorationColor: "rgba(107,107,107,0.6)" })}>{bad}</div>
        </div>
      ))}
      <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Caption>UK spelling</Caption>
        {["optimise", "organisation", "licence", "colour", "programme"].map((w) => (
          <Badge key={w} tone="ghost">
            {w}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function CopyRules() {
  return (
    <div style={{ ...fill, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, gridAutoRows: "1fr" }}>
      {[
        ["No em dashes", "Anywhere. Use a comma, brackets or a full stop."],
        ["Never “free”", "Write “at no charge”."],
        ["Nothing unverified", "No made-up metrics, testimonials or absolute claims. Leave [verify] or [quote] until checked."],
        ["Price means price", "No open invitation to amend scope next to a firm price."],
        ["No internal notes", "Search the file for an opening square bracket before the final render."],
        ["UK English", "Optimise, organisation, licence. We for Gitwork, you for the reader."],
      ].map(([t, d]) => (
        <Card key={t} style={{ display: "flex", flexDirection: "column" }}>
          <div style={display(26)}>{t}</div>
          <div style={body(17, GW.muted, { marginTop: 10 })}>{d}</div>
        </Card>
      ))}
    </div>
  );
}

function Taglines() {
  return (
    <div style={fill}>
      {TAGLINES.map((t, i) => (
        <div key={t} style={{ display: "grid", gridTemplateColumns: "64px 1fr", alignItems: "baseline", padding: "24px 0", borderBottom: `1px solid ${GW.paperRule}` }}>
          <span style={mono(13, GW.signal, { fontWeight: 600 })}>{`0${i + 1}`}</span>
          <span style={display(38, { lineHeight: 1.15 })}>{t}</span>
        </div>
      ))}
    </div>
  );
}

function DeliveryLine() {
  return (
    <div style={{ ...fill, display: "flex", flexDirection: "column", gap: 20 }}>
      <Card style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "40px 52px" }}>
        <div style={display(40, { fontStyle: "italic", fontWeight: 600, lineHeight: 1.3, maxWidth: 840 })}>
          “Global build capacity, UK quality control. Every release is reviewed and deployed by a UK based senior engineer.”
        </div>
        <div style={{ marginTop: 26 }}>
          <Caption>Word for word, every time</Caption>
        </div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
        {["Name the studio location, partners or suppliers", "Imply we do not use offshore", "Claim the team is senior-only"].map((t) => (
          <Card key={t}>
            <Verdict ok={false} />
            <div style={body(18, GW.text, { marginTop: 12 })}>{t}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Offers() {
  return (
    <div style={{ ...fill, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, flex: 1 }}>
        {OFFERS.map((o, i) => (
          <Card
            key={o.name}
            style={
              i === 1
                ? { background: GW.signal, borderColor: GW.signal, color: GW.white, display: "flex", flexDirection: "column" }
                : { display: "flex", flexDirection: "column" }
            }
          >
            <div>
              <Badge tone={i === 1 ? "ink" : "ghost"}>{o.name}</Badge>
            </div>
            <div style={body(19, i === 1 ? GW.white : GW.text, { marginTop: 14 })}>{o.line}</div>
            <div style={display(34, { marginTop: "auto" })}>{o.price}</div>
          </Card>
        ))}
      </div>
      <div style={mono(13)}>Call to action: the 30 minute audit · gitwork.co.uk/audit · at no charge</div>
    </div>
  );
}

function LogoPrimary() {
  return (
    <div style={{ ...fill, display: "grid", gridTemplateRows: "1.15fr 1fr", gap: 20 }}>
      <Card style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 72 }}>
        <div style={{ textAlign: "center" }}>
          <GitworkRoundel size={120} />
          <div style={{ marginTop: 18, borderTop: `1px solid ${GW.ink}`, paddingTop: 10 }}>
            <Caption>Roundel</Caption>
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <GitworkWordmark height={96} />
          <div style={{ marginTop: 18, borderTop: `1px solid ${GW.ink}`, paddingTop: 10 }}>
            <Caption>Wordmark</Caption>
          </div>
        </div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={{ background: GW.ink, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <GitworkWordmark height={70} variant="paper" />
        </div>
        <div style={{ background: GW.signal, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <GitworkWordmark height={70} variant="white" />
        </div>
      </div>
    </div>
  );
}

function Roundel() {
  const sizes = [160, 96, 56, 32, 24];
  return (
    <div style={{ ...fill, display: "flex", flexDirection: "column", gap: 20 }}>
      <Card style={{ flex: 1, display: "flex", alignItems: "center" }}>
        {/* Centred as a group; inside it, every size sits on one baseline so the labels line up. */}
        <div style={{ flex: 1, display: "flex", alignItems: "flex-end", justifyContent: "space-around" }}>
          {sizes.map((s) => (
            <div key={s} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
              <div style={{ borderRadius: 999, boxShadow: `0 0 0 1px ${GW.paperRule}` }}>
                <GitworkRoundel size={s} />
              </div>
              <Caption>{s}px</Caption>
            </div>
          ))}
        </div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
        {[
          ["Disc", "Paper", GW.paper],
          ["Letter", "Ink, Fraunces Bold", GW.ink],
          ["Full stop", "Signal", GW.signal],
        ].map(([k, v, c]) => (
          <Card key={k} style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ width: 40, height: 40, borderRadius: 10, background: c, boxShadow: `inset 0 0 0 1px ${GW.paperRule}` }} />
            <div>
              <Caption>{k}</Caption>
              <div style={body(18, GW.text, { marginTop: 4 })}>{v}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ClearSpace() {
  const h = 110;
  const x = h * 0.22; // the dot is 22% of the wordmark's height
  return (
    <div style={{ ...fill, display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20 }}>
      <Card style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28 }}>
        <div style={{ position: "relative", padding: x, outline: `1.5px dashed ${GW.signal}`, background: GW.signalTint }}>
          <div style={{ background: GW.white }}>
            <GitworkWordmark height={h} />
          </div>
          {["top", "bottom"].map((side) => (
            <span
              key={side}
              style={{
                position: "absolute",
                left: "50%",
                [side]: 0,
                height: x,
                width: x,
                transform: "translateX(-50%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                ...mono(13, GW.signal, { fontWeight: 600, letterSpacing: 0 }),
              }}
            >
              x
            </span>
          ))}
        </div>
        <Caption>x = the height of the purple dot</Caption>
      </Card>
      <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 20 }}>
        <Card style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <Caption>Wordmark minimum</Caption>
          <GitworkWordmark height={90 / 4.8} />
          <div style={display(30)}>90px wide</div>
        </Card>
        <Card style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <Caption>Roundel minimum</Caption>
          <GitworkRoundel size={24} />
          <div style={display(30)}>24px</div>
        </Card>
      </div>
    </div>
  );
}

function LogoVariations() {
  const tiles: { ground: string; mark: ReactNode; name: string; use: string; light: boolean }[] = [
    { ground: GW.paper, mark: <GitworkWordmark height={56} />, name: "Ink on paper", use: "Covers, headers and sign-offs on paper.", light: true },
    { ground: GW.white, mark: <GitworkWordmark height={56} />, name: "Ink on white", use: "Cards, email and the web.", light: true },
    { ground: GW.ink, mark: <GitworkWordmark height={56} variant="paper" />, name: "Paper on ink", use: "Ink covers and dark slides. The dot stays purple.", light: false },
    { ground: GW.signal, mark: <GitworkWordmark height={56} variant="white" />, name: "White on purple", use: "Purple pages and photography.", light: false },
  ];
  return (
    <div style={{ ...fill, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 20 }}>
      {tiles.map((t) => (
        <div
          key={t.name}
          style={{
            background: t.ground,
            borderRadius: 14,
            border: `1px solid ${t.light ? GW.paperRule : t.ground}`,
            padding: "22px 26px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>{t.mark}</div>
          <Caption color={t.light ? GW.muted : GW.white}>{t.name}</Caption>
          <div style={body(16, t.light ? GW.text : GW.white, { marginTop: 4 })}>{t.use}</div>
        </div>
      ))}
    </div>
  );
}

function LogoMisuse() {
  const tiles: { label: string; mark: ReactNode; ground?: string }[] = [
    { label: "Stretch it", mark: <div style={{ transform: "scaleX(1.45)" }}><GitworkWordmark height={46} /></div> },
    { label: "Rotate it", mark: <div style={{ transform: "rotate(-12deg)" }}><GitworkWordmark height={46} /></div> },
    { label: "Recolour the dot", mark: <div style={{ filter: "hue-rotate(150deg) saturate(1.4)" }}><GitworkWordmark height={46} /></div> },
    { label: "Add a shadow", mark: <div style={{ filter: "drop-shadow(6px 8px 4px rgba(12,12,24,0.45))" }}><GitworkWordmark height={46} /></div> },
    {
      label: "Set it in a font",
      mark: <div style={{ fontFamily: FONT.body, fontWeight: 700, fontSize: 52, letterSpacing: "-0.03em" }}>Gitwork.</div>,
    },
    { label: "Lose the contrast", mark: <GitworkWordmark height={46} />, ground: "#3A3A48" },
  ];
  return (
    <div style={{ ...fill, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gridTemplateRows: "1fr 1fr", gap: 20 }}>
      {tiles.map((t) => (
        <div
          key={t.label}
          style={{
            background: GW.white,
            border: `1px solid ${GW.paperRule}`,
            borderRadius: 14,
            padding: 20,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              flex: 1,
              borderRadius: 10,
              background: t.ground ?? GW.paper,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {t.mark}
          </div>
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={body(17, GW.text, { fontWeight: 500 })}>{t.label}</span>
            <Verdict ok={false} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TypeFamilies() {
  const rows: { name: string; role: string; sample: ReactNode }[] = [
    { name: "Fraunces", role: "Headings · Bold, with bold italic for the one accent", sample: <span style={display(44)}>From prompt to <span style={{ fontStyle: "italic", color: GW.signal }}>production</span>.</span> },
    { name: "Inter", role: "Copy and interface · Light, Regular, SemiBold", sample: <span style={body(26, GW.text, { fontWeight: 300 })}>Every release is reviewed by a <span style={{ fontWeight: 600 }}>UK based senior engineer</span>.</span> },
    { name: "JetBrains Mono", role: "Eyebrows, labels and metadata · always uppercase", sample: <span style={mono(22, GW.text, { letterSpacing: "0.2em", fontWeight: 600 })}>Proposal · gitwork.co.uk</span> },
    { name: "Playfair Display", role: "Italic, for step numerals only", sample: <span style={{ fontFamily: FONT.numeral, fontStyle: "italic", fontSize: 46, color: GW.signal }}>i. ii. iii. iv.</span> },
  ];
  return (
    <div style={fill}>
      {rows.map((r) => (
        <div key={r.name} style={{ display: "grid", gridTemplateColumns: "250px 1fr", gap: 28, alignItems: "center", padding: "22px 0", borderBottom: `1px solid ${GW.paperRule}` }}>
          <div>
            <div style={body(22, GW.text, { fontWeight: 600 })}>{r.name}</div>
            <div style={body(15, GW.muted, { marginTop: 4, lineHeight: 1.4 })}>{r.role}</div>
          </div>
          <div style={{ whiteSpace: "nowrap", overflowX: "clip" }}>{r.sample}</div>
        </div>
      ))}
    </div>
  );
}

type ScaleRow = { name: string; spec: string; style: CSSProperties; sample: string };

function ScaleTable({ rows }: { rows: ScaleRow[] }) {
  return (
    <div style={fill}>
      {rows.map((r) => (
        <div key={r.name} style={{ display: "grid", gridTemplateColumns: "150px 210px 1fr", gap: 20, alignItems: "baseline", padding: "12px 0", borderBottom: `1px solid ${GW.paperRule}` }}>
          <span style={mono(13, GW.text, { fontWeight: 600 })}>{r.name}</span>
          <span style={mono(12)}>{r.spec}</span>
          {/* overflow-x: clip, not hidden: hidden also clips vertically and cuts off descenders. */}
          <span style={{ whiteSpace: "nowrap", overflowX: "clip", ...r.style }}>{r.sample}</span>
        </div>
      ))}
    </div>
  );
}

function TypeScale() {
  return (
    <ScaleTable
      rows={[
        { name: "Cover h1", spec: "Fraunces 76 / 1.02", style: display(76, { lineHeight: 1.02 }), sample: "Production." },
        { name: "h2", spec: "Fraunces 44 / 1.08", style: display(44), sample: "Fixed scope. Fixed price." },
        { name: "h3", spec: "Fraunces 25 / 1.2", style: display(25), sample: "Diagnose" },
        { name: "Lede", spec: "Inter Light 20 / 1.5", style: body(20, GW.muted, { fontWeight: 300 }), sample: "AI got you to a prototype. We get you to production." },
        { name: "Body", spec: "Inter 15.5 / 1.62", style: body(15.5), sample: "Every release is reviewed and deployed by a UK based senior engineer." },
        { name: "h4", spec: "Inter SemiBold 15", style: body(15, GW.text, { fontWeight: 600 }), sample: "Launch Pad" },
        { name: "Small", spec: "Inter 13 / 1.55", style: body(13), sample: "Cancel any time." },
        { name: "Eyebrow", spec: "Mono 11 · 0.2em", style: mono(11, GW.signal, { fontWeight: 600, letterSpacing: "0.2em" }), sample: "Proposal" },
        { name: "Label", spec: "Mono 10 · 0.14em", style: mono(10), sample: "gitwork.co.uk" },
      ]}
    />
  );
}

function WebScale() {
  return (
    <ScaleTable
      rows={[
        { name: "Web h1", spec: "72 to 96px", style: display(72, { lineHeight: 1.02 }), sample: "Production." },
        { name: "Web h2", spec: "52 to 68px", style: display(52), sample: "Shipped by humans." },
        { name: "Web h3", spec: "36 to 48px", style: display(36), sample: "MVP Sprint" },
        { name: "Body large", spec: "18 to 20px", style: body(18), sample: "Idea to MVP in 4 to 6 weeks." },
        { name: "Body", spec: "16 to 18px", style: body(16), sample: "Global build capacity, UK quality control." },
        { name: "Caption", spec: "12 to 14px", style: body(12, GW.muted), sample: "Book the 30 minute audit at no charge." },
      ]}
    />
  );
}

function LabelsNumerals() {
  const steps = ["Diagnose", "Scope", "Build", "Release"];
  return (
    <div style={{ ...fill, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <Card style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <Caption>Eyebrow, above a heading</Caption>
        <div>
          <div style={mono(15, GW.signal, { fontWeight: 600, letterSpacing: "0.2em" })}>Scope</div>
          <div style={display(46, { marginTop: 12 })}>
            What we <span style={{ fontStyle: "italic", color: GW.signal }}>ship</span>.
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${GW.paperRule}`, paddingTop: 20 }}>
          <Caption>Labels: refs, footers, table heads</Caption>
          <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", ...mono(14) }}>
            <span>PROP-2026-012 · Acme Ltd</span>
            <span>02</span>
          </div>
        </div>
      </Card>
      <Card>
        <Caption>Step numerals</Caption>
        <div style={{ marginTop: 18 }}>
          {steps.map((s, i) => (
            <div key={s} style={{ display: "flex", gap: 22, alignItems: "baseline", padding: "14px 0", borderBottom: i < steps.length - 1 ? `1px solid ${GW.paperRule}` : "none" }}>
              <span style={{ fontFamily: FONT.numeral, fontStyle: "italic", fontSize: 38, color: GW.signal, minWidth: 60 }}>
                {["i.", "ii.", "iii.", "iv."][i]}
              </span>
              <span style={display(26)}>{s}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

const SWATCHES = [
  { name: "Ink", hex: "#0C0C18", use: "Dark page, dark text", dark: true },
  { name: "Paper", hex: "#F2EDE4", use: "The default ground", dark: false },
  { name: "Signal", hex: "#6B52FF", use: "One accent per page", dark: true },
  { name: "Text", hex: "#1A1A1E", use: "Copy on light grounds", dark: true },
  { name: "Muted", hex: "#6B6B6B", use: "Ledes, captions, refs", dark: true },
  { name: "Warm", hex: "#EAE5DC", use: "Break pages", dark: false },
  { name: "White", hex: "#FFFFFF", use: "Cards", dark: false },
];

function Palette() {
  return (
    <div style={{ ...fill, display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr", gridTemplateRows: "1.3fr 1fr 1fr", gap: 16 }}>
      {SWATCHES.map((s, i) => (
        <div
          key={s.name}
          style={{
            gridRow: i === 0 ? "1 / span 2" : undefined,
            gridColumn: i === 6 ? "2 / span 2" : undefined,
            background: s.hex,
            borderRadius: 10,
            border: `1px solid ${GW.paperRule}`,
            padding: "18px 20px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            color: s.dark ? GW.white : GW.text,
          }}
        >
          <div style={body(20, "inherit", { fontWeight: 600 })}>{s.name}</div>
          <div>
            <div style={mono(13, "inherit", { fontWeight: 600 })}>{s.hex}</div>
            <div style={body(14, "inherit", { marginTop: 2, opacity: 0.85 })}>{s.use}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

const SEMANTIC: { token: string; paper: string; ink: string }[] = [
  { token: "surface", paper: GW.paper, ink: GW.ink },
  { token: "surface-card", paper: GW.white, ink: "rgba(242,237,228,0.05)" },
  { token: "fg", paper: GW.text, ink: GW.paper },
  { token: "fg-muted", paper: GW.muted, ink: GW.inkMuted },
  { token: "rule", paper: GW.paperRule, ink: GW.inkRule },
  { token: "accent-fg", paper: GW.signal, ink: GW.paper },
];

function Semantic() {
  return (
    <div style={{ ...fill, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      {(["paper", "ink"] as const).map((mode) => {
        const dark = mode === "ink";
        return (
          <div key={mode} style={{ background: dark ? GW.ink : GW.paper, border: `1px solid ${dark ? GW.ink : GW.paperRule}`, borderRadius: 14, padding: "26px 28px", color: dark ? GW.paper : GW.text }}>
            <Caption color={dark ? GW.inkMuted : GW.muted}>{dark ? "Ink page" : "Paper page"}</Caption>
            <div style={{ marginTop: 14 }}>
              {SEMANTIC.map((row) => (
                <div key={row.token} style={{ display: "flex", alignItems: "center", gap: 14, padding: "9px 0", borderBottom: `1px solid ${dark ? GW.inkRule : GW.paperRule}` }}>
                  <span style={{ width: 26, height: 26, borderRadius: 6, background: row[mode], boxShadow: `inset 0 0 0 1px ${dark ? GW.inkRule : GW.paperRule}` }} />
                  <span style={mono(13, "inherit")}>{row.token}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 20, background: dark ? "rgba(242,237,228,0.05)" : GW.white, border: `1px solid ${dark ? GW.inkRule : GW.paperRule}`, borderRadius: 14, padding: "16px 18px" }}>
              <div style={mono(11, dark ? GW.paper : GW.signal, { fontWeight: 600, letterSpacing: "0.2em" })}>Scope</div>
              <div style={display(24, { marginTop: 6 })}>The same card, both pages.</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Contrast() {
  const rows: [string, string, string, number][] = [
    ["Text on paper", GW.text, GW.paper, 14.88],
    ["Paper on ink", GW.paper, GW.ink, 16.65],
    ["Muted on white", GW.muted, GW.white, 5.33],
    ["White on signal", GW.white, GW.signal, 4.91],
    ["Muted on paper", GW.muted, GW.paper, 4.57],
    ["Muted on warm", GW.muted, GW.warm, 4.25],
    ["Signal on paper", GW.signal, GW.paper, 4.21],
    ["Signal on ink", GW.signal, GW.ink, 3.95],
    ["Signal on signal tint", GW.signal, "#E3DDF7", 3.61],
  ];
  return (
    <div style={fill}>
      <div style={{ display: "grid", gridTemplateColumns: "88px 1fr 110px 170px", gap: 20, paddingBottom: 10, borderBottom: `1px solid ${GW.paperRule}`, ...mono(12) }}>
        <span>Sample</span>
        <span>Pair</span>
        <span style={{ textAlign: "right" }}>Ratio</span>
        <span>Small text</span>
      </div>
      {rows.map(([name, fg, bg, ratio]) => {
        const pass = ratio >= 4.5;
        return (
          <div key={name} style={{ display: "grid", gridTemplateColumns: "88px 1fr 110px 170px", gap: 20, alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${GW.paperRule}` }}>
            <span style={{ background: bg, color: fg, borderRadius: 8, border: `1px solid ${GW.paperRule}`, textAlign: "center", padding: "4px 0", ...display(20) }}>Aa</span>
            <span style={body(18)}>{name}</span>
            <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", ...body(18, GW.text, { fontWeight: 600 }) }}>{ratio.toFixed(2)}:1</span>
            <span>{pass ? <Badge tone="ink">Passes AA</Badge> : <Badge tone="ghost">24px and up</Badge>}</span>
          </div>
        );
      })}
    </div>
  );
}

function Surfaces() {
  return (
    <div style={{ ...fill, display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, flex: 1 }}>
        {[
          { tone: "white", badge: "ghost" as const, name: "Launch Pad", line: "Finish your vibe-coded app.", price: "From £4,995" },
          { tone: "signal", badge: "ink" as const, name: "MVP Sprint", line: "Idea to MVP in 4 to 6 weeks.", price: "From £25,000" },
          { tone: "ink", badge: "ghost" as const, name: "Greenfield", line: "Embedded squads.", price: "From £15,000/mo" },
        ].map((c) => (
          <div
            key={c.name}
            style={{
              borderRadius: 14,
              padding: "26px 24px",
              display: "flex",
              flexDirection: "column",
              background: c.tone === "white" ? GW.white : c.tone === "signal" ? GW.signal : GW.ink,
              border: `1px solid ${c.tone === "white" ? GW.paperRule : "transparent"}`,
              color: c.tone === "white" ? GW.text : c.tone === "signal" ? GW.white : GW.paper,
            }}
          >
            <div>
              <Badge tone={c.badge}>{c.name}</Badge>
            </div>
            <div style={body(18, "inherit", { marginTop: 16 })}>{c.line}</div>
            <div style={display(30, { marginTop: "auto" })}>{c.price}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
        {[
          ["Card radius", "14px"],
          ["Swatch radius", "10px"],
          ["Badges, buttons", "Pill"],
          ["Shadows", "None"],
        ].map(([k, v]) => (
          <div key={k} style={{ borderTop: `1px solid ${GW.ink}`, paddingTop: 12 }}>
            <Caption>{k}</Caption>
            <div style={display(28, { marginTop: 6 })}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Components() {
  return (
    <div style={{ ...fill, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "auto 1fr", gap: 20 }}>
      <Card>
        <Caption>Badges</Caption>
        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Badge>Proposal</Badge>
          <Badge tone="signal">New</Badge>
          <Badge tone="tint">Draft</Badge>
          <Badge tone="ghost">Ghost</Badge>
        </div>
      </Card>
      <Card>
        <Caption>Buttons</Caption>
        <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
          <span style={{ background: GW.signal, color: GW.white, borderRadius: 999, padding: "14px 26px", ...body(16, GW.white, { fontWeight: 600, lineHeight: 1 }) }}>Book the audit</span>
          <span style={{ border: `1px solid ${GW.text}`, borderRadius: 999, padding: "14px 26px", ...body(16, GW.text, { fontWeight: 600, lineHeight: 1 }) }}>See the scope</span>
        </div>
      </Card>
      <Card style={{ display: "flex", flexDirection: "column" }}>
        <Caption>Stats · verified numbers only</Caption>
        <div style={{ marginTop: "auto", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {[
            ["4 to 6", "Weeks to MVP"],
            ["30", "Minute audit"],
            ["[verify]", "Apps shipped"],
          ].map(([f, l]) => (
            <div key={l}>
              <div style={display(f.length > 5 ? 30 : 52, { color: GW.signal, letterSpacing: "-0.03em", lineHeight: 1 })}>{f}</div>
              <div style={mono(11, GW.muted, { marginTop: 10 })}>{l}</div>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <Caption>Steps</Caption>
        {[
          ["i.", "Audit", "We read the build and tell you what it takes."],
          ["ii.", "Scope", "One fixed scope, one fixed price."],
          ["iii.", "Ship", "Reviewed and deployed by a UK based senior engineer."],
        ].map(([n, t, d]) => (
          <div key={n} style={{ display: "flex", gap: 18, marginTop: 16 }}>
            <span style={{ fontFamily: FONT.numeral, fontStyle: "italic", fontSize: 30, color: GW.signal, minWidth: 44, lineHeight: 1 }}>{n}</span>
            <div>
              <div style={body(17, GW.text, { fontWeight: 600 })}>{t}</div>
              <div style={body(15, GW.muted)}>{d}</div>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function Bullets() {
  return (
    <div style={{ ...fill, display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 20 }}>
      <Card>
        <Caption>The house bullet</Caption>
        <div style={{ marginTop: 22 }}>
          <ArrowList
            size={22}
            items={[
              "Auth and payments to production standards.",
              "QA and deployment by a UK based senior engineer.",
              "A fixed scope, agreed before we start.",
            ]}
          />
        </div>
        <div style={{ marginTop: 26, borderTop: `1px solid ${GW.paperRule}`, paddingTop: 16 }}>
          <Caption>Or a plain list, ruled</Caption>
          {["Discovery", "Build", "Release"].map((t) => (
            <div key={t} style={{ padding: "12px 0", borderBottom: `1px solid ${GW.paperRule}`, ...body(18) }}>
              {t}
            </div>
          ))}
        </div>
      </Card>
      <div style={{ display: "grid", gridTemplateRows: "repeat(3, 1fr)", gap: 20 }}>
        {[
          ["Emoji", "🚀  ✨  ✅"],
          ["Icon fonts", "◆  ●  ■"],
          ["Coloured ticks", "✓  ✓  ✓"],
        ].map(([k, glyphs]) => (
          <Card key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <Verdict ok={false} />
              <div style={body(18, GW.text, { marginTop: 8 })}>{k}</div>
            </div>
            <span style={{ fontSize: 28, color: GW.muted, letterSpacing: "0.1em" }}>{glyphs}</span>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PageGeometry() {
  const s = 0.36; // 1000 x 1414 drawn at 360 x 509
  const W = 1000 * s;
  const H = 1414 * s;
  return (
    <div style={{ ...fill, display: "grid", gridTemplateColumns: `${W + 80}px 1fr`, gap: 28 }}>
      <div style={{ position: "relative", display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
        <div style={{ position: "relative", width: W, height: H, background: GW.white, border: `1px solid ${GW.paperRule}`, borderRadius: 4 }}>
          <div style={{ position: "absolute", left: 84 * s, right: 84 * s, top: 76 * s, bottom: 68 * s, outline: `1.5px dashed ${GW.signal}`, background: GW.signalTint }} />
          <div style={{ position: "absolute", left: 84 * s, right: 84 * s, top: 76 * s, height: 36, borderBottom: `1px solid ${GW.paperRule}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 6px" }}>
            <GitworkRoundel size={14} />
            <span style={mono(7)}>Page head</span>
          </div>
          <div style={{ position: "absolute", left: 84 * s, right: 84 * s, bottom: 40 * s - 6, display: "flex", justifyContent: "space-between", padding: "0 6px", ...mono(7) }}>
            <span>gitwork.co.uk</span>
            <span>2</span>
          </div>
          <span style={{ position: "absolute", left: 4, top: "50%", ...mono(9, GW.signal, { letterSpacing: 0 }) }}>84</span>
          <span style={{ position: "absolute", top: 4, left: "50%", ...mono(9, GW.signal, { letterSpacing: 0 }) }}>76</span>
          <span style={{ position: "absolute", bottom: 4, left: "50%", ...mono(9, GW.signal, { letterSpacing: 0 }) }}>68</span>
        </div>
      </div>
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          {[
            ["Page", "1000 x 1414px"],
            ["Side margins", "84px"],
            ["Top / bottom", "76 / 68px"],
            ["Foot offset", "40px"],
          ].map(([k, v]) => (
            <div key={k} style={{ borderTop: `1px solid ${GW.ink}`, paddingTop: 10 }}>
              <Caption>{k}</Caption>
              <div style={display(28, { marginTop: 6 })}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 34 }}>
          <Caption>What fits on one page</Caption>
          <div style={{ marginTop: 16 }}>
            <ArrowList
              size={18}
              items={[
                "About 450 words of prose",
                "A heading and 8 to 10 table rows",
                "Three cards and 6 rows",
                "Four step cards, and nothing else",
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Architecture() {
  const box = (children: ReactNode, style: CSSProperties = {}) => (
    <div style={{ background: GW.white, border: `1px solid ${GW.paperRule}`, borderRadius: 14, padding: "18px 20px", ...style }}>{children}</div>
  );
  const row = (name: string, line?: string) => (
    <div key={name} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: `1px solid ${GW.paperRule}` }}>
      <span style={body(17, GW.text, { fontWeight: 600 })}>{name}</span>
      {line ? <span style={body(14, GW.muted, { textAlign: "right" })}>{line}</span> : null}
    </div>
  );
  return (
    <div style={{ ...fill, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        {box(
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <GitworkWordmark height={38} />
            <Caption>Masterbrand</Caption>
          </div>,
          { padding: "16px 26px" },
        )}
      </div>
      {/* One stem down from Gitwork, splitting to the three columns below. */}
      <svg aria-hidden width="100%" height="48" viewBox="0 0 1000 48" preserveAspectRatio="none" style={{ display: "block" }}>
        <path d="M500 0 V24 M163 24 H837 M163 24 V48 M500 24 V48 M837 24 V48" stroke={GW.ink} strokeWidth="1.5" fill="none" />
      </svg>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 20, flex: 1 }}>
        {box(
          <>
            <Caption>Offers · services we sell</Caption>
            <div style={{ marginTop: 10 }}>{OFFERS.map((o) => row(o.name))}</div>
            <div style={body(14, GW.muted, { marginTop: 12 })}>Plain type. No logos of their own.</div>
          </>,
        )}
        {box(
          <>
            <Caption>Product · under Gitwork</Caption>
            <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 14 }}>
              <FoundryAppIcon size={44} />
              <FoundryWordmark height={40} />
            </div>
            <div style={{ marginTop: 16, borderTop: `1px solid ${GW.paperRule}`, paddingTop: 12 }}>
              <Caption>Modules, inside Foundry</Caption>
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {MODULES.map(([m]) => (
                  <span key={m} style={{ border: `1px solid ${GW.paperRule}`, borderRadius: 6, padding: "4px 9px", ...body(14, GW.text) }}>
                    {m}
                  </span>
                ))}
              </div>
            </div>
          </>,
          { borderColor: FOUNDRY.indigo },
        )}
        {box(
          <>
            <Caption>Industry arm · Leisure Tech</Caption>
            <div style={{ marginTop: 16 }}>
              <LeisureTechLogo height={40} />
            </div>
            <div style={{ marginTop: 16, borderTop: `1px solid ${GW.paperRule}`, paddingTop: 4 }}>
              {row("AfterDesk", "Live")}
              {row("REMIT", "In build")}
            </div>
            <div style={body(14, GW.muted, { marginTop: 12 })}>Platforms built and run by Gitwork.</div>
          </>,
          { borderColor: LEISURE_TECH.green },
        )}
      </div>
    </div>
  );
}

function Foundry() {
  return (
    <div style={{ ...fill, display: "grid", gridTemplateColumns: "1.25fr 1fr", gridTemplateRows: "1.2fr 1fr", gap: 20 }}>
      <Card style={{ gridRow: "1 / span 2", display: "flex", flexDirection: "column" }}>
        <Caption>The lockup</Caption>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <FoundryWordmark height={130} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, borderTop: `1px solid ${GW.paperRule}`, paddingTop: 16 }}>
          <div style={{ background: GW.ink, borderRadius: 10, height: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <FoundryWordmark height={56} ground="dark" />
          </div>
          <div style={{ background: "#FAFAF9", border: `1px solid ${GW.paperRule}`, borderRadius: 10, height: 120, display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
            <FoundryAppIcon size={64} />
            <Caption>App icon</Caption>
          </div>
        </div>
      </Card>
      <Card>
        <Caption>Colour</Caption>
        {[
          [FOUNDRY.indigo, "Foundry indigo", "The full stop and the app icon"],
          [FOUNDRY.interface, "Interface blue", "Buttons, links, active states"],
        ].map(([c, n, u]) => (
          <div key={n} style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 16 }}>
            <span style={{ width: 44, height: 44, borderRadius: 10, background: c }} />
            <div>
              <div style={body(17, GW.text, { fontWeight: 600 })}>
                {n} <span style={mono(12, GW.muted)}>{c}</span>
              </div>
              <div style={body(15, GW.muted)}>{u}</div>
            </div>
          </div>
        ))}
      </Card>
      <Card style={{ display: "flex", flexDirection: "column" }}>
        <Caption>The signature</Caption>
        <div style={{ marginTop: 14, border: `1px solid rgba(0,0,0,0.08)`, borderRadius: 10, overflow: "hidden", background: "#FFFFFF" }}>
          <div style={{ padding: "9px 14px", borderBottom: "1px solid rgba(0,0,0,0.08)", ...mono(12, "#475569", { letterSpacing: "0.1em" }) }}>01 // Delivery watch</div>
          <div style={{ padding: "12px 14px", display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontFamily: FONT.foundryDisplay, fontSize: 40, lineHeight: 1, color: "#0F172A" }}>12</span>
            <span style={mono(11, "#64748B")}>Tasks in flight</span>
          </div>
        </div>
        <div style={body(15, GW.muted, { marginTop: "auto" })}>Numbered panels, DM Serif figures, mono labels. foundry.gitwork.co.uk</div>
      </Card>
    </div>
  );
}

function LeisureTech() {
  return (
    <div style={{ ...fill, display: "grid", gridTemplateColumns: "1.25fr 1fr", gridTemplateRows: "1fr 1fr", gap: 20 }}>
      <Card style={{ display: "flex", flexDirection: "column" }}>
        <Caption>The lockup</Caption>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <LeisureTechLogo height={84} />
        </div>
      </Card>
      <Card>
        <Caption>Its own identity</Caption>
        {[
          [LEISURE_TECH.green, "Leisure green", LEISURE_TECH.green],
          [LEISURE_TECH.gold, "Leisure gold", LEISURE_TECH.gold],
        ].map(([c, n, hex]) => (
          <div key={n} style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 14 }}>
            <span style={{ width: 40, height: 40, borderRadius: 10, background: c }} />
            <div style={body(17, GW.text, { fontWeight: 600 })}>
              {n} <span style={mono(12, GW.muted)}>{hex}</span>
            </div>
          </div>
        ))}
        <div style={body(15, GW.muted, { marginTop: 14 })}>Archivo for headings. leisuretech.ai</div>
      </Card>
      <div style={{ background: LEISURE_TECH.deepGreen, borderRadius: 14, padding: "22px 26px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <LeisureTechLogo height={46} variant="reverse" />
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={mono(12, GW.white)}>Software delivered by</span>
          <GitworkWordmark height={24} variant="white" />
        </div>
      </div>
      <Card>
        <Caption>How Gitwork appears</Caption>
        <div style={{ marginTop: 14 }}>
          <ArrowList
            size={17}
            items={[
              "Leisure Tech leads its own pages, in its own colours",
              "Gitwork is named as the studio: Software delivered by Gitwork",
              "The footer says Leisure Tech is a trading name of Gitwork Group Ltd",
            ]}
          />
        </div>
      </Card>
    </div>
  );
}

function AfterDesk() {
  return (
    <div style={{ ...fill, display: "grid", gridTemplateColumns: "1.25fr 1fr", gridTemplateRows: "1.2fr 1fr", gap: 20 }}>
      <div style={{ gridRow: "1 / span 2", background: AFTERDESK.navy, borderRadius: 14, padding: "24px 28px", display: "flex", flexDirection: "column", color: GW.white }}>
        <Caption color="rgba(255,255,255,0.7)">The lockup, on its navy</Caption>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <AfterDeskLogo height={84} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, borderTop: "1px solid rgba(255,255,255,0.16)", paddingTop: 16 }}>
          <AfterDeskIcon size={56} />
          <div>
            <div style={body(17, GW.white, { fontWeight: 600 })}>One platform for service, warranty and repair</div>
            <div style={mono(12, "rgba(255,255,255,0.7)", { marginTop: 4 })}>afterdesk.ai · AfterDesk Ltd</div>
          </div>
        </div>
      </div>
      <Card>
        <Caption>Colour and type</Caption>
        {[
          [AFTERDESK.navy, "AfterDesk navy", AFTERDESK.navy],
          [AFTERDESK.accent, "Sky accent", AFTERDESK.accent],
        ].map(([c, n, hex]) => (
          <div key={n} style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 14 }}>
            <span style={{ width: 40, height: 40, borderRadius: 10, background: c, boxShadow: `inset 0 0 0 1px ${GW.paperRule}` }} />
            <div style={body(17, GW.text, { fontWeight: 600 })}>
              {n} <span style={mono(12, GW.muted)}>{hex}</span>
            </div>
          </div>
        ))}
        <div style={body(15, GW.muted, { marginTop: 14 })}>Inter throughout.</div>
      </Card>
      <Card>
        <Caption>Before it goes on paper</Caption>
        <div style={body(17, GW.text, { marginTop: 12, lineHeight: 1.45 })}>
          AfterDesk only publishes a white logo, so for now it always sits on its navy. A dark version is needed before it can appear on a paper page.
        </div>
      </Card>
    </div>
  );
}

function ProductLockup() {
  return (
    <div style={{ ...fill, display: "grid", gridTemplateRows: "1.25fr 1fr", gap: 20 }}>
      <Card style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "relative" }}>
          <FoundryWordmark height={150} />
          {/* Callouts, placed on the lockup's own geometry. In its 245 x 64 viewBox the name's
              x-height centre is about y 22, the dot is centred at y 38 and ends at x 244, and the
              endorsement is centred at about y 55. At 150px tall that is a scale of 150/64. */}
          <Callout x={-20} y={(22 * 150) / 64 - 8} label="Name" side="left" />
          <Callout x={(244 * 150) / 64 + 10} y={(38 * 150) / 64 - 8} label="Dot" side="right" />
          <Callout x={(244 * 150) / 64 + 10} y={(55 * 150) / 64 - 8} label="by Gitwork" side="right" />
        </div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
        {[
          ["Name", "The product's name as a placed asset, in a heavy serif. Never typed out in a font."],
          ["Dot", "The full stop, in the product's own colour. The only colour in the lockup."],
          ["Endorsement", "by Gitwork, in a light sans, muted, right-aligned to the dot."],
        ].map(([k, v]) => (
          <Card key={k}>
            <Caption>{k}</Caption>
            <div style={body(17, GW.text, { marginTop: 10 })}>{v}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Callout({ x, y, label, side }: { x: number; y: number; label: string; side: "left" | "right" }) {
  return (
    <span
      style={{
        position: "absolute",
        top: y,
        ...(side === "left" ? { right: `calc(100% - ${x}px)` } : { left: x }),
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexDirection: side === "left" ? "row-reverse" : "row",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 48, height: 1.5, background: GW.signal }} />
      <span style={mono(12, GW.signal, { fontWeight: 600 })}>{label}</span>
    </span>
  );
}

function ProductRules() {
  const tile = (ok: boolean, title: string, children: ReactNode) => (
    <Card style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={body(17, GW.text, { fontWeight: 600 })}>{title}</span>
        <Verdict ok={ok} />
      </div>
      <div style={{ flex: 1, marginTop: 14, background: GW.paper, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        {children}
      </div>
    </Card>
  );
  return (
    <div style={{ ...fill, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 20 }}>
      {tile(
        true,
        "The product leads its page",
        <div style={{ width: "100%", background: GW.white, borderRadius: 6, padding: "10px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${GW.paperRule}`, paddingBottom: 8 }}>
            <GitworkRoundel size={18} />
            <span style={mono(9)}>gitwork.co.uk</span>
          </div>
          <div style={{ paddingTop: 16, paddingBottom: 6 }}>
            <FoundryWordmark height={40} />
          </div>
        </div>,
      )}
      {tile(
        true,
        "In copy: Foundry by Gitwork",
        <div style={body(20, GW.text, { lineHeight: 1.45 })}>
          Your proposal was sent from <strong>Foundry by Gitwork</strong>. After that, just Foundry.
        </div>,
      )}
      {tile(
        false,
        "Two logos at the same size",
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <GitworkWordmark height={34} />
          <span style={{ width: 1, height: 40, background: GW.paperRule }} />
          <FoundryWordmark height={42} endorsement={false} />
        </div>,
      )}
      {tile(
        false,
        "A logo for a module",
        <span style={display(52)}>
          Pulse<span style={{ color: "#16A34A" }}>.</span>
        </span>,
      )}
    </div>
  );
}

function Modules() {
  return (
    <div style={{ ...fill, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <FoundryWordmark height={40} />
        <Caption>Seven modules, one product</Caption>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 32, flex: 1, alignContent: "start" }}>
        {MODULES.map(([name, line]) => (
          <div key={name} style={{ padding: "13px 0", borderBottom: `1px solid ${GW.paperRule}` }}>
            <div style={body(19, GW.text, { fontWeight: 600 })}>{name}</div>
            <div style={body(15, GW.muted, { marginTop: 2 })}>{line}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 22px" }}>
          <span style={body(18, GW.text)}>Run a scan in Pulse</span>
          <Verdict ok />
        </Card>
        <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 22px" }}>
          <span style={body(18, GW.text)}>Pulse by Gitwork, in its own colour</span>
          <Verdict ok={false} />
        </Card>
      </div>
    </div>
  );
}

interface ProductSlot {
  mark: ReactNode;
  lockup: ReactNode;
  line: string;
  where: string;
  status: string;
  /** Who it sits under, when that is not Gitwork directly. */
  under?: string;
}

const PRODUCT_SLOTS: (ProductSlot | null)[] = [
  {
    mark: <FoundryAppIcon size={56} />,
    lockup: <FoundryWordmark height={40} />,
    line: "Proposals, clients, support and production-readiness checks in one place.",
    where: "foundry.gitwork.co.uk",
    status: "Live",
  },
  {
    mark: <AfterDeskIcon size={56} />,
    lockup: (
      <span style={{ display: "inline-block", background: AFTERDESK.navy, borderRadius: 8, padding: "8px 12px" }}>
        <AfterDeskLogo height={24} />
      </span>
    ),
    line: "Warranty, service and repair for caravan and leisure dealerships.",
    where: "afterdesk.ai",
    status: "Live",
    under: "A Leisure Tech platform",
  },
  null,
];

function ProductCards() {
  return (
    <div style={{ ...fill, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 20 }}>
      {PRODUCT_SLOTS.map((p, i) => (
        <div
          key={i}
          style={{
            borderRadius: 14,
            padding: "24px 24px",
            display: "flex",
            flexDirection: "column",
            background: p ? GW.white : "transparent",
            border: p ? `1px solid ${GW.paperRule}` : `1.5px dashed ${GW.muted}`,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            {p ? p.mark : <span style={{ width: 56, height: 56, borderRadius: 12, border: `1.5px dashed ${GW.muted}` }} />}
            <Badge tone={p ? "tint" : "ghost"}>{p ? p.status : "Next"}</Badge>
          </div>
          <div style={{ marginTop: 24, minHeight: 44, display: "flex", alignItems: "center" }}>
            {p ? p.lockup : <span style={display(36, { color: GW.muted })}>[Product].</span>}
          </div>
          <div style={mono(11, GW.muted, { marginTop: 10, minHeight: 14 })}>{p ? (p.under ?? "By Gitwork") : "[Who it sits under]"}</div>
          <div style={body(17, p ? GW.text : GW.muted, { marginTop: 12 })}>{p ? p.line : "[One line on what it does.]"}</div>
          <div style={{ marginTop: "auto", paddingTop: 16, borderTop: `1px solid ${GW.paperRule}`, ...mono(12) }}>
            {p ? p.where : "[Where it lives]"}
          </div>
        </div>
      ))}
    </div>
  );
}

function DocCover() {
  const s = 0.36;
  return (
    <div style={{ ...fill, display: "grid", gridTemplateColumns: `${1000 * s}px 1fr`, gap: 40 }}>
      <div style={{ width: 1000 * s, height: 1414 * s, overflow: "hidden", borderRadius: 4, boxShadow: `0 0 0 1px ${GW.paperRule}` }}>
        <div style={{ width: 1000, height: 1414, transform: `scale(${s})`, transformOrigin: "0 0", background: GW.ink, color: GW.paper, padding: "76px 84px 68px", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <GitworkRoundel size={48} />
            <GitworkWordmark height={30} variant="paper" />
          </div>
          <div style={{ marginTop: "auto", marginBottom: 92 }}>
            <div style={mono(11, GW.paper, { fontWeight: 600, letterSpacing: "0.2em" })}>Proposal · PROP-2026-012</div>
            <div style={display(76, { marginTop: 18, lineHeight: 1.02, maxWidth: 680 })}>
              From prompt to <span style={{ fontStyle: "italic", color: GW.signal }}>production</span>.
            </div>
            <div style={body(20, GW.inkMuted, { marginTop: 26, fontWeight: 300 })}>A fixed scope plan to take your app live.</div>
          </div>
          <div style={{ display: "flex", gap: 56, paddingTop: 26, borderTop: `1px solid ${GW.inkRule}` }}>
            {[
              ["Client", "Acme Ltd"],
              ["Date", "October 2026"],
              ["Prepared by", "Gitwork Group Ltd"],
            ].map(([k, v]) => (
              <div key={k}>
                <div style={mono(10, GW.inkMuted)}>{k}</div>
                <div style={body(14.5, GW.paper, { marginTop: 7, fontWeight: 500 })}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div>
        <Caption>On every cover</Caption>
        <div style={{ marginTop: 18 }}>
          <ArrowList
            size={19}
            items={[
              "Roundel and paper wordmark, top left",
              "A mono eyebrow with the document type and reference",
              "One Fraunces headline with one purple accent",
              "A light lede in ink-muted, one line",
              "The meta row: client, date, prepared by",
            ]}
          />
        </div>
        <div style={{ marginTop: 26 }}>
          <Caption>Made in</Caption>
          <div style={body(18, GW.text, { marginTop: 8 })}>Docs, on the Gitwork theme. The cover is generated, not drawn.</div>
        </div>
      </div>
    </div>
  );
}

function SlideExample() {
  return (
    <div style={{ ...fill, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ width: 800, height: 450, position: "relative", background: GW.paper, borderRadius: 6, boxShadow: `0 0 0 1px ${GW.paperRule}`, overflow: "hidden", alignSelf: "center" }}>
        <div style={{ position: "absolute", left: 40, right: 40, top: 26, display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 10, borderBottom: `1px solid ${GW.paperRule}` }}>
          <GitworkRoundel size={20} />
          <span style={mono(8)}>PROP-2026-012 · Acme Ltd</span>
        </div>
        <div style={{ position: "absolute", left: 40, top: 92, width: 330 }}>
          <div style={mono(9, GW.signal, { fontWeight: 600, letterSpacing: "0.2em" })}>Scope</div>
          <div style={display(40, { marginTop: 10 })}>
            What we <span style={{ fontStyle: "italic", color: GW.signal }}>ship</span>.
          </div>
          <div style={body(13, GW.muted, { marginTop: 12, fontWeight: 300 })}>Fixed scope. Fixed price. Fixed timeline.</div>
        </div>
        <div style={{ position: "absolute", left: 420, right: 40, top: 100 }}>
          <ArrowList size={14} items={["Auth and payments to production standards.", "QA and deployment by a UK based senior engineer.", "Handover with a runbook and a wiki."]} />
        </div>
        <div style={{ position: "absolute", left: 40, right: 40, bottom: 18, display: "flex", justifyContent: "space-between", ...mono(7) }}>
          <span>gitwork.co.uk</span>
          <span>04</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
        {[
          ["Canvas", "1600 x 900"],
          ["Ground", "Paper"],
          ["Headline", "Fraunces"],
          ["Made in", "Docs, + New → Deck"],
        ].map(([k, v]) => (
          <div key={k} style={{ borderTop: `1px solid ${GW.ink}`, paddingTop: 10 }}>
            <Caption>{k}</Caption>
            <div style={display(24, { marginTop: 6 })}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Checklist() {
  const items = [
    "No em dashes, anywhere",
    "No “free”. It says “at no charge”",
    "Every [verify] and [quote] resolved, or the claim removed",
    "A search for “[” finds nothing",
    "One tagline, one purple thing and one logo per page",
    "The delivery line, if used, is word for word",
    "Headings render in Fraunces, not Times",
    "A product is named Foundry by Gitwork on first mention",
  ];
  return (
    <div style={{ ...fill, display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 32, alignContent: "start" }}>
      {items.map((t) => (
        <div key={t} style={{ display: "flex", gap: 16, alignItems: "flex-start", padding: "20px 0", borderBottom: `1px solid ${GW.paperRule}` }}>
          <span aria-hidden style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 6, border: `1.5px solid ${GW.ink}`, marginTop: 2 }} />
          <span style={body(20, GW.text, { lineHeight: 1.4 })}>{t}</span>
        </div>
      ))}
    </div>
  );
}

const VISUALS: Record<VisualId, () => ReactNode> = {
  positioning: Positioning,
  voice: Voice,
  "copy-rules": CopyRules,
  taglines: Taglines,
  "delivery-line": DeliveryLine,
  offers: Offers,
  "logo-primary": LogoPrimary,
  roundel: Roundel,
  "clear-space": ClearSpace,
  "logo-variations": LogoVariations,
  "logo-misuse": LogoMisuse,
  "type-families": TypeFamilies,
  "type-scale": TypeScale,
  "web-scale": WebScale,
  "labels-numerals": LabelsNumerals,
  palette: Palette,
  semantic: Semantic,
  contrast: Contrast,
  surfaces: Surfaces,
  components: Components,
  bullets: Bullets,
  "page-geometry": PageGeometry,
  architecture: Architecture,
  foundry: Foundry,
  "leisure-tech": LeisureTech,
  afterdesk: AfterDesk,
  "product-lockup": ProductLockup,
  "product-rules": ProductRules,
  modules: Modules,
  "product-cards": ProductCards,
  "doc-cover": DocCover,
  "slide-example": SlideExample,
  checklist: Checklist,
};

/** Any page of the deck, by kind. */
export function GuidelineSlide({ page, chapter, index }: { page: GuidelinePage; chapter: GuidelineChapter; index: number }) {
  if (page.kind === "cover") return <CoverSlide page={page} />;
  if (page.kind === "contents") return <ContentsSlide />;
  if (page.kind === "chapter") return <ChapterSlide page={page} chapter={chapter} />;
  return <ContentSlide page={page} chapter={chapter} index={index} />;
}
