"""
Outline Foundry brand type to SVG paths.

Why this exists: an SVG loaded through <img> — a README badge, a client site's
footer, an email — is an isolated document. It cannot fetch a webfont and it does
not inherit the host page's CSS, so `font-family: 'DM Serif Display'` silently
falls back to whatever the viewer has. That is not merely off-brand: Georgia's
numerals are old-style, so a Pulse score would render with a descending "9".

Outlining to paths gives pixel-exact DM Serif Display / JetBrains Mono / Inter
with zero embedded font bytes and no fallback risk anywhere it lands.

The faces are read straight out of the base64 woff2 already vendored for Deck
(`vendor/bento/slides/src/foundry/fontdata.ts`), so there is exactly one copy of
the brand fonts in the repo. Shaping goes through HarfBuzz, so kerning matches
what a browser would do.

Requires (build-time only — the generated assets are committed):
    pip install fonttools brotli uharfbuzz
"""
import base64
import io
import pathlib
import re

from fontTools.misc.transform import Transform
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
import uharfbuzz as hb

REPO = pathlib.Path(__file__).resolve().parents[2]
FONTDATA = REPO / "vendor/bento/slides/src/foundry/fontdata.ts"

# name in fontdata.ts -> weight to instance the variable axis at
SPECS = {
    "mono": ("JETBRAINS_MONO_VAR", 400),
    "mono-500": ("JETBRAINS_MONO_VAR", 500),
    "mono-700": ("JETBRAINS_MONO_VAR", 700),
    "serif": ("DM_SERIF_DISPLAY_400", None),
    "sans": ("INTER_VAR", 400),
    "sans-500": ("INTER_VAR", 500),
    "sans-600": ("INTER_VAR", 600),
}


def _woff2(const_name):
    text = FONTDATA.read_text()
    m = re.search(rf"export const {const_name} = '[^,]*,([A-Za-z0-9+/=]+)'", text)
    if not m:
        raise SystemExit(f"{const_name} not found in {FONTDATA}")
    return base64.b64decode(m.group(1))


class Face:
    def __init__(self, const_name, weight=None):
        font = TTFont(io.BytesIO(_woff2(const_name)))
        if weight is not None and "fvar" in font:
            font = instancer.instantiateVariableFont(font, {"wght": weight})
        # Loaded from .woff2, so TTFont keeps flavor="woff2" and would re-save
        # compressed. HarfBuzz cannot parse that and fails *silently*: every
        # character maps to .notdef, giving uniform 500-unit advances and no
        # outlines at all. Clearing the flavor writes a plain sfnt.
        font.flavor = None
        buf = io.BytesIO()
        font.save(buf)
        self.data = buf.getvalue()
        self.tt = TTFont(io.BytesIO(self.data))
        self.upem = self.tt["head"].unitsPerEm
        self.glyphset = self.tt.getGlyphSet()
        self.order = self.tt.getGlyphOrder()
        self.hbfont = hb.Font(hb.Face(self.data))

    def shape(self, text):
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(self.hbfont, buf, {"kern": True, "liga": True})
        return list(zip(buf.glyph_infos, buf.glyph_positions))

    def measure(self, text, size, tracking=0.0):
        """Advance width in px. `tracking` is px added after each glyph."""
        s = size / self.upem
        run = self.shape(text)
        if not run:
            return 0.0
        return sum(pos.x_advance * s + tracking for _, pos in run) - tracking

    def path(self, text, size, x=0.0, y=0.0, tracking=0.0, anchor="start"):
        """SVG path `d` for `text`, baseline at y, box edge at x.

        anchor: start | middle | end. Returns (d, width)."""
        s = size / self.upem
        width = self.measure(text, size, tracking)
        if anchor == "middle":
            x -= width / 2
        elif anchor == "end":
            x -= width

        pen = SVGPathPen(self.glyphset, ntos=lambda v: f"{v:.2f}")
        cursor = x
        for info, pos in self.shape(text):
            name = self.order[info.codepoint]
            # Font space is y-up, SVG is y-down, hence the -s.
            t = Transform(s, 0, 0, -s, cursor + pos.x_offset * s, y - pos.y_offset * s)
            self.glyphset[name].draw(TransformPen(pen, t))
            cursor += pos.x_advance * s + tracking
        return pen.getCommands(), width

    def glyph_path(self, ch):
        """Raw outline in FONT UNITS (y-up), for the runtime glyph table."""
        pen = SVGPathPen(self.glyphset, ntos=lambda v: f"{v:.0f}")
        run = self.shape(ch)
        if not run:
            return "", 0
        info, pos = run[0]
        self.glyphset[self.order[info.codepoint]].draw(pen)
        return pen.getCommands(), pos.x_advance


_cache = {}


def face(name):
    if name not in _cache:
        _cache[name] = Face(*SPECS[name])
    return _cache[name]
