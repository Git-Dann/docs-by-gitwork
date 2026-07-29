#!/usr/bin/env python3
"""
Generate Foundry's badge assets.

    pip install fonttools brotli uharfbuzz
    python3 scripts/badge/generate.py

Emits, both of which are COMMITTED (nothing runs this at build or request time):

  public/badge/*.svg      the "Foundry Approved" family — static + animated,
                          light + dark. Static filenames carry no suffix because
                          static is the default; animated ones end `-anim`.
  src/lib/badge/glyphs.ts brand type outlines for the dynamic Pulse badge, which
                          composes its SVG per request and so cannot shell out to
                          Python.

## Two builds, and why

A CSS animation inside an <img> does not simply "not apply" when it cannot run:
the browser starts it and freezes the timeline at t=0, so an entrance animation
renders its *hidden* first frame. No fill-mode fixes that — "frame 0" and
"finished" are contradictory states. It bites wherever a page is rasterised
without ever being scrolled: offscreen images in a full-page screenshot, social
card renderers, print-to-PDF.

So the static build is the default and the one that goes on someone else's site,
and the animated build is for surfaces we control (the Pulse report,
/pulse-overview, a proposal) where a real person scrolls it into view and the
browser starts the timeline exactly then.

The two share one geometry: the static build is the animated one with the
<style> block dropped. That is only correct because every base style already
equals the finished state — see `entrance()`. Keep that invariant; reduced-motion
renders exercise it, since `animation:none` must leave a correct badge.
"""
import gzip
import json
import math
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from fonttype import face  # noqa: E402

REPO = pathlib.Path(__file__).resolve().parents[2]
SVG_OUT = REPO / "public/badge"
TS_OUT = REPO / "src/lib/badge/glyphs.ts"

# ── DESIGN.md tokens ────────────────────────────────────────────────────────
BLUE, BLUE_DEEP = "#1D4ED8", "#1E3A8A"        # colors.primary / primary-deep
CANVAS, WHITE, INK = "#FAFAF9", "#FFFFFF", "#0F172A"
STEEL, STONE = "#64748B", "#94A3B8"
SUCCESS, WARNING, DANGER = "#16A34A", "#D97706", "#DC2626"

# Dark shell. Accent and semantics lift, because #1D4ED8 / #16A34A on a
# near-black surface fail contrast — the rule DESIGN.md § Deck already applies.
D_FACE, D_CANVAS, D_INK = "#1E293B", "#0F172A", "#F8FAFC"
D_BLUE, D_MUTED, D_FAINT = "#6BA0FF", "#CBD5E1", "#64748B"
D_SUCCESS, D_WARNING, D_DANGER = "#4ADE80", "#FBBF24", "#F87171"

LIGHT = dict(face=WHITE, canvas=CANVAS, ink=INK, muted=STEEL, faint=STONE,
             hair="rgba(0,0,0,0.08)", track="rgba(0,0,0,0.09)", accent=BLUE,
             ok=SUCCESS, warn=WARNING, bad=DANGER, seal_ink=BLUE_DEEP, knock=WHITE)
DARK = dict(face=D_FACE, canvas=D_CANVAS, ink=D_INK, muted=D_MUTED, faint=D_FAINT,
            hair="rgba(255,255,255,0.10)", track="rgba(255,255,255,0.13)", accent=D_BLUE,
            ok=D_SUCCESS, warn=D_WARNING, bad=D_DANGER, seal_ink=D_INK, knock=D_CANVAS)

AUDIT_DATE = "2026-07-29"   # sample copy for the static "Foundry Approved" art

MOTION = True               # flipped by the emitter to produce both builds


# ── helpers ─────────────────────────────────────────────────────────────────
def txt(fname, s, size, x, y, fill, tracking=0.0, anchor="start", cls=None):
    d, w = face(fname).path(s, size, x=x, y=y, tracking=tracking, anchor=anchor)
    attr = f' class="{cls}"' if cls else ""
    return f'<path d="{d}" fill="{fill}"{attr}/>', w


def wof(fname, s, size, tracking=0.0):
    return face(fname).measure(s, size, tracking)


def circular_text(fname, s, size, cx, cy, radius, tracking=0.0, fill=WHITE, start_deg=-90):
    """Place each glyph individually around a circle, rotated tangentially.

    Text on a path is not an option here: the type is outlined, so there is no
    <textPath> to hang it on."""
    f = face(fname)
    circ = 2 * math.pi * radius
    advances = [f.measure(ch, size) + tracking for ch in s]
    ang = start_deg - (sum(advances) / circ * 360) / 2
    out = []
    for ch, adv in zip(s, advances):
        step = adv / circ * 360
        a = ang + step / 2
        if ch.strip():
            rad = math.radians(a)
            d, _ = f.path(ch, size, x=0, y=0, anchor="middle")
            out.append(f'<g transform="translate({cx + radius * math.cos(rad):.2f} '
                       f'{cy + radius * math.sin(rad):.2f}) rotate({a + 90:.2f})">'
                       f'<path d="{d}" fill="{fill}"/></g>')
        ang += step
    return "".join(out)


def rrect(x, y, w, h, r, **kw):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" '
            + " ".join(f'{k.replace("_", "-")}="{v}"' for k, v in kw.items()) + "/>")


def card(w, h, t, r=10):
    """The house widget-card face: flat fill + hairline border, never a shadow."""
    return rrect(0.5, 0.5, w - 1, h - 1, r, fill=t["face"], stroke=t["hair"])


# The authentic Foundry "F" — path 0 of public/foundry-logo.svg, so the monogram
# wears the real wordmark's letterform rather than a lookalike.
FOUNDRY_F = re.findall(r'<path d="([^"]+)"',
                       (REPO / "public/foundry-logo.svg").read_text())[0]
F_BOX = 43.4


def foundry_f(size, x, y, fill=WHITE):
    return (f'<g transform="translate({x:.2f} {y:.2f}) scale({size / F_BOX:.4f})">'
            f'<path d="{FOUNDRY_F}" fill="{fill}"/></g>')


REDUCED = "@media (prefers-reduced-motion:reduce){*{animation:none!important}}"
PING = "@keyframes ping{0%,100%{opacity:1}50%{opacity:.4}}"


def entrance(name, hold, start, end, mid=""):
    """A keyframe that holds `start` for the first `hold`% of its run, then
    settles on `end`.

    Deliberately no fill-mode, and `end` is always the element's own base style,
    so an un-animated render is the finished render. Staggering lives in the
    percentages rather than in animation-delay for the same reason: a delay with
    fill-mode `backwards` would reintroduce a hidden resting state."""
    sel = f"0%,{hold}%" if hold > 0 else "0%"
    return f"@keyframes {name}{{{sel}{{{start}}}{mid}100%{{{end}}}}}"


POP = "opacity:0;transform:scale(.82)", "opacity:1;transform:scale(1)"


def svg(w, h, body, style="", title=""):
    st = f"<style>{REDUCED}{PING}{style}</style>" if MOTION else ""
    return ('<svg xmlns="http://www.w3.org/2000/svg" '
            f'width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'role="img" aria-label="{title}"><title>{title}</title>{st}{body}</svg>')


# ════════════════════════════════════════════════════════════════════════════
# The "Foundry Approved" family
# ════════════════════════════════════════════════════════════════════════════

def seal(t=LIGHT):
    """A1 · The Seal — circular stamp, slowly rotating legend, drawn tick.
    160×160. Do not render below 64px: the legend stops being legible."""
    cx = cy = 80
    ticks = "".join(
        f'<line x1="{cx + 71 * math.cos(math.radians(a)):.2f}" '
        f'y1="{cy + 71 * math.sin(math.radians(a)):.2f}" '
        f'x2="{cx + (76 if i % 5 == 0 else 74) * math.cos(math.radians(a)):.2f}" '
        f'y2="{cy + (76 if i % 5 == 0 else 74) * math.sin(math.radians(a)):.2f}" '
        f'stroke="{t["accent"]}" stroke-width="{1.4 if i % 5 == 0 else 0.8}" '
        f'opacity="{0.55 if i % 5 == 0 else 0.25}"/>'
        for i, a in enumerate(range(0, 360, 6)))

    body = f"""
<circle cx="{cx}" cy="{cy}" r="78" fill="{t["canvas"] if t is LIGHT else t["face"]}"/>
<circle cx="{cx}" cy="{cy}" r="78" fill="none" stroke="{t["accent"]}" stroke-width="1" opacity="0.2"/>
{ticks}
<g class="ring">{circular_text("mono-500", "FOUNDRY APPROVED · BUILT BY GITWORK · ", 8,
                               cx, cy, 62, tracking=1.1, fill=t["seal_ink"])}</g>
<circle cx="{cx}" cy="{cy}" r="49" fill="none" stroke="{t["accent"]}" stroke-width="0.8" opacity="0.28"/>
<g class="core"><circle cx="{cx}" cy="{cy}" r="45" fill="{t["accent"]}"/>
<circle cx="{cx}" cy="{cy}" r="45" fill="url(#g)"/></g>
<g transform="translate({cx} {cy - 6})"><path d="M -9 0 L -3 6.4 L 9.4 -6.6" fill="none"
   stroke="{t["knock"]}" stroke-width="5.5" stroke-linecap="square" class="tick"/></g>
{txt("mono-500", "APPROVED", 8, cx, cy + 26, t["knock"], tracking=1.6, anchor="middle", cls="lbl")[0]}
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.14"/>
<stop offset="1" stop-color="#000000" stop-opacity="0.10"/></linearGradient></defs>"""

    style = ("@keyframes spin{to{transform:rotate(360deg)}}"
             + entrance("core", 9, *POP, "66%{transform:scale(1.04)}")
             + entrance("tick", 41, "stroke-dashoffset:30", "stroke-dashoffset:0")
             + entrance("lbl", 71, "opacity:0", "opacity:1")
             + f".ring{{transform-origin:{cx}px {cy}px;animation:spin 44s linear infinite}}"
             + f".core{{transform-origin:{cx}px {cy}px;animation:core .55s cubic-bezier(.2,.8,.3,1)}}"
             + ".tick{stroke-dasharray:30;animation:tick .93s cubic-bezier(.4,0,.2,1)}"
             + ".lbl{animation:lbl 1.05s ease-out}")
    return svg(160, 160, body, style, "Foundry Approved")


def plate(t=LIGHT):
    """A2 · The Instrument Plate — the house widget-card grammar, so it sits
    beside any other Foundry panel without looking like a sticker. 268×132."""
    W, H = 268, 132
    st, stw = txt("mono-500", "PASS", 9, W - 16, 23, t["ok"], tracking=0.8, anchor="end")
    body = f"""
{card(W, H, t)}
<path d="M0.5 36.5 H{W - 0.5}" stroke="{t["hair"]}"/>
<g class="scan"><rect x="-56" y="1" width="56" height="35" fill="url(#sw)"/></g>
{txt("mono-500", "01 // FOUNDRY APPROVED", 10, 16, 23, t["ink"], tracking=1.2)[0]}
<circle cx="{W - 22 - stw}" cy="19.5" r="3" fill="{t["ok"]}" class="dot"/>{st}
<g class="mark">{rrect(16, 56, 32, 32, 6, fill=t["accent"])}
<g transform="translate(32 72)"><path d="M -7 0 L -2.2 5 L 7.3 -5.2" fill="none"
   stroke="{t["knock"]}" stroke-width="3.6" stroke-linecap="square" class="tick"/></g></g>
{txt("sans-600", "Approved", 21, 60, 79, t["ink"])[0]}
{txt("mono-500", f"AUDITED {AUDIT_DATE}", 9, 60, 97, t["muted"], tracking=0.8)[0]}
<defs><linearGradient id="sw" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="{t["accent"]}" stop-opacity="0"/>
<stop offset="0.5" stop-color="{t["accent"]}" stop-opacity="0.12"/>
<stop offset="1" stop-color="{t["accent"]}" stop-opacity="0"/></linearGradient></defs>"""
    style = (f"@keyframes scan{{0%,10%{{transform:translateX(0)}}"
             f"100%{{transform:translateX({W + 56}px)}}}}"
             + entrance("mark", 18, *POP, "66%{transform:scale(1.04)}")
             + entrance("tick", 48, "stroke-dashoffset:22", "stroke-dashoffset:0")
             + ".scan{animation:scan 2.9s cubic-bezier(.4,0,.2,1)}"
             + ".mark{transform-origin:32px 72px;animation:mark .55s cubic-bezier(.2,.8,.3,1)}"
             + ".tick{stroke-dasharray:22;animation:tick .87s ease-out}"
             + ".dot{animation:ping 2.4s 1.2s ease-in-out infinite}")
    return svg(W, H, body, style, "Foundry Approved")


def shield(label="FOUNDRY", value="APPROVED"):
    """A3 · The Shield — inline README / footer badge at shields.io proportions.
    Carries its own dark ground, so it needs no light/dark variant. h=22."""
    H, PAD, FS = 22, 9, 9.5
    lw, vw = wof("mono-500", label, FS, 0.8), wof("mono-500", value, FS, 0.8)
    left, right = lw + PAD * 2, vw + PAD * 2 + 15
    W = left + right
    body = f"""
<clipPath id="c">{rrect(0, 0, W, H, 4)}</clipPath>
<g clip-path="url(#c)"><rect width="{left}" height="{H}" fill="{INK}"/>
<rect x="{left}" width="{right}" height="{H}" fill="{BLUE}"/>
<rect width="{W}" height="{H}" fill="url(#sh)"/>
<g class="gl"><rect x="-40" width="40" height="{H}" fill="url(#gl)"/></g></g>
{txt("mono-500", label, FS, PAD, 14.6, "#E2E8F0", tracking=0.8)[0]}
<g transform="translate({left + PAD + 6} 11)"><path d="M -4.6 0 L -1.4 3.4 L 4.8 -3.6"
   fill="none" stroke="{WHITE}" stroke-width="2.2" stroke-linecap="square" class="tick"/></g>
{txt("mono-500", value, FS, left + PAD + 15, 14.6, WHITE, tracking=0.8)[0]}
<defs><linearGradient id="sh" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.13"/>
<stop offset="1" stop-color="#000000" stop-opacity="0.13"/></linearGradient>
<linearGradient id="gl" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/>
<stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.28"/>
<stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient></defs>"""
    style = (f"@keyframes glide{{0%,20%{{transform:translateX(0)}}"
             f"100%{{transform:translateX({W + 60}px)}}}}"
             + entrance("tick", 38, "stroke-dashoffset:14", "stroke-dashoffset:0")
             + ".gl{animation:glide 4.4s cubic-bezier(.4,0,.2,1) infinite}"
             + ".tick{stroke-dasharray:14;animation:tick .65s ease-out}")
    return svg(round(W, 1), H, body, style, f"{label} {value}")


def monogram(with_tick=True):
    """A4 · The Monogram — compact square mark. The tick lozenge is dropped
    below ~24px, where it measurably degrades into a smudge; use the `-sm`
    build there instead of shrinking this one."""
    tick = "" if not with_tick else f"""
<g class="badge"><circle cx="41" cy="41" r="12" fill="{WHITE}"/>
<circle cx="41" cy="41" r="10" fill="{SUCCESS}"/>
<g transform="translate(41 41)"><path d="M -4.2 0 L -1.3 3.1 L 4.4 -3.3" fill="none"
   stroke="{WHITE}" stroke-width="2.1" stroke-linecap="square" class="tick"/></g></g>"""
    body = f"""
{rrect(0, 0, 56, 56, 8, fill=BLUE)}{rrect(0, 0, 56, 56, 8, fill="url(#mg)")}
<g class="f">{foundry_f(23, 12 if with_tick else 16.5, 13 if with_tick else 16, WHITE)}</g>
{tick}
<defs><linearGradient id="mg" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.16"/>
<stop offset="1" stop-color="#000000" stop-opacity="0.12"/></linearGradient></defs>"""
    style = (entrance("fm", 10, *POP, "66%{transform:scale(1.04)}")
             + entrance("bd", 46, *POP, "78%{transform:scale(1.04)}")
             + entrance("tick", 63, "stroke-dashoffset:14", "stroke-dashoffset:0")
             + ".f{transform-origin:28px 28px;animation:fm .5s cubic-bezier(.2,.8,.3,1)}"
             + ".badge{transform-origin:41px 41px;animation:bd .74s cubic-bezier(.2,.8,.3,1)}"
             + ".tick{stroke-dasharray:14;animation:tick .95s ease-out}")
    return svg(56, 56, body, style, "Foundry Approved")


def lockup(t=LIGHT, score=92):
    """A5 · The Certificate Lockup — horizontal, for a client site footer.
    Width is derived from the shaped type, so the title can never collide with
    the VERIFIED chip whatever the copy becomes."""
    H = 72
    title, meta = "Foundry Approved", f"AUDITED {AUDIT_DATE} · PULSE {score}/100"
    body_w = max(wof("serif", title, 22), wof("mono-500", meta, 9, 0.9))
    chip = wof("mono-500", "VERIFIED", 8, 1) + 12
    W = round(74 + body_w + 28 + chip + 18)
    body = f"""
{card(W, H, t)}
<rect x="0.5" y="0.5" width="3" height="{H - 1}" fill="{t["accent"]}" class="rule"/>
<g class="mark">{rrect(22, 20, 36, 36, 6, fill=t["accent"])}
<g transform="translate(40 38)"><path d="M -8 0 L -2.6 5.6 L 8.2 -5.8" fill="none"
   stroke="{t["knock"]}" stroke-width="3.8" stroke-linecap="square" class="tick"/></g></g>
{txt("serif", title, 22, 74, 37, t["ink"])[0]}
{txt("mono-500", meta, 9, 74, 55, t["muted"], tracking=0.9)[0]}
<circle cx="{W - 18 - chip}" cy="33.5" r="3.2" fill="{t["ok"]}" class="dotg"/>
{txt("mono-500", "VERIFIED", 8, W - 18, 37, t["ok"], tracking=1, anchor="end")[0]}"""
    style = (entrance("rule", 0, "transform:scaleY(0)", "transform:scaleY(1)")
             + entrance("mark", 21, *POP, "70%{transform:scale(1.04)}")
             + entrance("tick", 47, "stroke-dashoffset:26", "stroke-dashoffset:0")
             + f".rule{{transform-origin:0 {H}px;animation:rule .5s cubic-bezier(.4,0,.2,1)}}"
             + ".mark{transform-origin:40px 38px;animation:mark .57s cubic-bezier(.2,.8,.3,1)}"
             + ".tick{stroke-dasharray:26;animation:tick .95s ease-out}"
             + ".dotg{animation:ping 2.4s 1s ease-in-out infinite}")
    return svg(W, H, body, style, "Foundry Approved")


def _files():
    return {
        "foundry-approved-seal.svg": seal(),
        "foundry-approved-seal-dark.svg": seal(DARK),
        "foundry-approved-plate.svg": plate(),
        "foundry-approved-plate-dark.svg": plate(DARK),
        "foundry-approved-shield.svg": shield(),
        "foundry-approved-monogram.svg": monogram(),
        "foundry-approved-monogram-sm.svg": monogram(with_tick=False),
        "foundry-approved-lockup.svg": lockup(),
        "foundry-approved-lockup-dark.svg": lockup(DARK),
    }


# ════════════════════════════════════════════════════════════════════════════
# Runtime glyph table for the dynamic Pulse badge
# ════════════════════════════════════════════════════════════════════════════

# Uppercase only: every label on these badges is a mono caps readout per
# DESIGN.md, and halving the table halves the module.
MONO_CHARS = ("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
              " .,:/-_()[]&+%#'·")
SERIF_CHARS = "0123456789"


def glyph_table():
    mono, serif = face("mono-500"), face("serif")

    advances = {mono.shape(c)[0][1].x_advance for c in "AWil1."}
    if len(advances) != 1:
        raise SystemExit(f"JetBrains Mono is not monospaced here: {advances}")
    mono_adv = advances.pop()

    mono_g = {}
    for ch in MONO_CHARS:
        d, _ = mono.glyph_path(ch)
        if d:
            mono_g[ch] = d
    serif_g = {}
    for ch in SERIF_CHARS:
        d, adv = serif.glyph_path(ch)
        serif_g[ch] = {"d": d, "adv": adv}

    return f"""// GENERATED by scripts/badge/generate.py — do not edit by hand.
//
// Brand type outlined to SVG paths, in FONT UNITS with the y-axis pointing up
// (the font's own coordinate space). Consumers place a run inside one
// `scale(k -k)` group and step the cursor by each glyph's advance.
//
// This exists because the Pulse badge is composed per request and served as an
// image: an SVG in an <img> cannot load a webfont, and a system-font fallback
// would render the score in Georgia's old-style numerals, where "9" descends
// below the baseline. See scripts/badge/fonttype.py.

/** JetBrains Mono 500 — every readout label. Monospaced, hence one advance. */
export const MONO_UPEM = {mono.upem};
export const MONO_ADVANCE = {mono_adv};
export const MONO_GLYPHS: Record<string, string> = {json.dumps(mono_g, indent=2, ensure_ascii=False)};

/** DM Serif Display — the score figure only, so digits are all that is needed. */
export const SERIF_UPEM = {serif.upem};
export const SERIF_GLYPHS: Record<string, {{ d: string; adv: number }}> = {json.dumps(serif_g, indent=2)};
"""


# ── emit ────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    SVG_OUT.mkdir(parents=True, exist_ok=True)
    TS_OUT.parent.mkdir(parents=True, exist_ok=True)

    written = {}
    for motion, suffix in ((False, ""), (True, "-anim")):
        MOTION = motion
        for name, content in _files().items():
            out = name.replace(".svg", f"{suffix}.svg")
            (SVG_OUT / out).write_text(content)
            written[out] = (len(content), len(gzip.compress(content.encode())))

    for k in sorted(written):
        raw, gz = written[k]
        print(f"  public/badge/{k:38} {raw:>7,} B  gz {gz:>6,} B")

    ts = glyph_table()
    TS_OUT.write_text(ts)
    print(f"\n  {TS_OUT.relative_to(REPO)}  {len(ts):,} B  "
          f"gz {len(gzip.compress(ts.encode())):,} B")
