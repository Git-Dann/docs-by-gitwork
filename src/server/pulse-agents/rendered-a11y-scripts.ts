// In-page scripts for the rendered-page accessibility collector.
//
// ⚠️ These are plain-JavaScript STRINGS, not functions. page.evaluate(fn) serialises
// fn.toString(), and whatever the build pipeline injected into it (esbuild's __name
// helper under keepNames, SWC's helpers) is not defined in the page. A string is
// what runs, character for character, in every environment.
//
// They only COLLECT. Every judgement lives in pulse-checks/rendered-a11y.ts.

const HELPERS = String.raw`
const W = window;
function deepActive() {
  let a = document.activeElement;
  while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
  return a;
}
function deepFromPoint(x, y) {
  let e = document.elementFromPoint(x, y);
  while (e && e.shadowRoot) { const inner = e.shadowRoot.elementFromPoint(x, y); if (!inner || inner === e) break; e = inner; }
  return e;
}
function allEls(root, out) {
  for (const el of root.querySelectorAll('*')) { out.push(el); if (el.shadowRoot) allEls(el.shadowRoot, out); }
  return out;
}
function shown(el) {
  if (!el.isConnected) return false;
  if (el.closest && el.closest('[inert]')) return false;
  if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true })) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  const cs = getComputedStyle(el);
  return cs.visibility === 'visible' && cs.display !== 'none';
}
function label(el) {
  const t = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('alt') || el.getAttribute('title')
    || el.getAttribute('value') || el.getAttribute('placeholder') || el.textContent || '').replace(/\s+/g, ' ').trim();
  return t.slice(0, 60);
}
function sel(el) {
  const parts = []; let n = el;
  for (let k = 0; n && n.nodeType === 1 && k < 3; k++) {
    let s = n.tagName.toLowerCase();
    if (n.id) { parts.unshift(s + '#' + CSS.escape(n.id)); break; }
    const c = Array.from(n.classList).filter((x) => x.length < 30).slice(0, 2);
    if (c.length) s += '.' + c.map((x) => CSS.escape(x)).join('.');
    parts.unshift(s);
    n = n.parentElement;
  }
  return parts.join(' > ').slice(0, 140);
}
function ref(el) { return { selector: sel(el), text: label(el), tag: el.tagName.toLowerCase() }; }
function vis(cs) {
  const o = (cs.outlineStyle === 'none' || parseFloat(cs.outlineWidth) === 0) ? 'none' : cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor + ' ' + cs.outlineOffset;
  const b = ['Top', 'Right', 'Bottom', 'Left'].map((s) => {
    const w = cs['border' + s + 'Width'], st = cs['border' + s + 'Style'];
    return (st === 'none' || st === 'hidden' || parseFloat(w) === 0) ? '-' : w + ' ' + st + ' ' + cs['border' + s + 'Color'];
  }).join('|');
  const td = cs.textDecorationLine === 'none' ? 'none' : cs.textDecorationLine + ' ' + cs.textDecorationColor + ' ' + cs.textDecorationThickness;
  return [o, cs.boxShadow, b, cs.backgroundColor, cs.backgroundImage, cs.color, td, cs.opacity, cs.transform, cs.fill, cs.stroke].join(' ; ');
}
function pseudo(el, which) {
  const p = getComputedStyle(el, which);
  return (p.content === 'none' || p.content === 'normal') ? '-' : vis(p) + ' ; ' + p.content + ' ' + p.width + ' ' + p.height;
}
function signature(el) {
  const s = { self: vis(getComputedStyle(el)), before: pseudo(el, '::before'), after: pseudo(el, '::after') };
  let p = el.parentElement;
  for (let k = 1; k <= 2 && p; k++, p = p.parentElement) s['p' + k] = vis(getComputedStyle(p));
  const kids = el.querySelectorAll('*');
  for (let k = 0; k < Math.min(4, kids.length); k++) s['c' + k] = vis(getComputedStyle(kids[k]));
  return s;
}
function opaque(e) {
  if (/^(IMG|VIDEO|CANVAS|PICTURE|SVG|IFRAME|OBJECT|EMBED)$/i.test(e.tagName)) return true;
  const cs = getComputedStyle(e);
  if (cs.backgroundImage && cs.backgroundImage !== 'none') return true;
  const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
  if (!m) return false;
  const parts = m[1].split(/[\s,\/]+/).filter(Boolean);
  return parts.length < 4 || parseFloat(parts[3]) > 0;
}
`;

/** Freeze transitions/animations at their end state, inventory the controls, take baselines. */
export const SETUP_SCRIPT = String.raw`(() => {
${HELPERS}
const st = document.createElement('style');
st.textContent = '*,*::before,*::after{transition-duration:0s!important;transition-delay:0s!important;animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;scroll-behavior:auto!important}';
(document.head || document.documentElement).appendChild(st);
const FOCUSABLE = 'a[href],area[href],button,input:not([type=hidden]),select,textarea,summary,iframe,[tabindex],[contenteditable=""],[contenteditable=true]';
const els = allEls(document, []);
const inventory = []; const nodes = [];
for (const el of els) {
  if (!el.matches(FOCUSABLE)) continue;
  const ti = el.getAttribute('tabindex');
  if (ti !== null && parseInt(ti, 10) < 0) continue;
  if (el.matches(':disabled')) continue;
  if (el.tagName === 'SUMMARY' && el.parentElement && el.parentElement.querySelector('summary') !== el) continue;
  if (!shown(el)) continue;
  const i = nodes.length;
  el.__paIdx = i;
  nodes.push(el);
  const radio = el.tagName === 'INPUT' && el.type === 'radio' && el.name ? 'radio:' + (el.form ? (el.form.id || 'f') : '') + ':' + el.name : null;
  inventory.push({ i, ref: ref(el), positiveTabindex: ti !== null && parseInt(ti, 10) > 0, radioGroup: radio });
}
const inv = new Set(nodes);
const ROLES = /^(button|link|checkbox|switch|slider|spinbutton)$/;
const mouseOnly = [];
for (const el of els) {
  if (inv.has(el) || mouseOnly.length >= 40) continue;
  const role = (el.getAttribute('role') || '').trim().toLowerCase();
  const clicky = ROLES.test(role) || (el.hasAttribute('onclick') && !role && /^(DIV|SPAN|LI|TD|IMG|P)$/.test(el.tagName));
  if (!clicky) continue;
  if (el.hasAttribute('tabindex')) continue;
  if (el.getAttribute('aria-disabled') === 'true') continue;
  if (el.matches('a[href],area[href],button,input,select,textarea,summary')) continue;
  if (el.parentElement && el.parentElement.closest('a[href],button,[tabindex]:not([tabindex^="-"])')) continue;
  if (el.querySelector('a[href],button,input,select,textarea,[tabindex]:not([tabindex^="-"])')) continue;
  if (!shown(el)) continue;
  const r = el.getBoundingClientRect();
  if (el.hasAttribute('onclick') && !role && (r.width > 600 || r.height > 300)) continue;
  mouseOnly.push(ref(el));
}
W.__pa = { nodes, base: {} };
for (let k = 0; k < Math.min(nodes.length, 150); k++) W.__pa.base[k] = signature(nodes[k]);
const words = (document.body ? document.body.innerText : '').split(/\s+/).filter(Boolean).length;
if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) document.activeElement.blur();
window.scrollTo(0, 0);
return { inventory, mouseOnly, words };
})()`;

/** After a Tab press: which control has focus, and (optionally) how it looks and whether it is covered. */
export function activeScript(capture: boolean): string {
  return String.raw`(() => {
${HELPERS}
const a = deepActive();
if (!a || a === document.body || a === document.documentElement) return { i: -1 };
const i = typeof a.__paIdx === 'number' ? a.__paIdx : -2;
const out = { i };
if (i === -2) out.ref = ref(a);
if (${capture ? "true" : "false"} && i >= 0) {
  out.after = signature(a);
  out.before = (W.__pa && W.__pa.base[i]) || null;
  out.inDialog = !!a.closest('[role=dialog],[role=alertdialog],dialog,[aria-modal=true]');
  const r = a.getBoundingClientRect();
  const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 2, r.top + 2], [r.right - 2, r.top + 2], [r.left + 2, r.bottom - 2], [r.right - 2, r.bottom - 2]]
    .filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight);
  if (pts.length === 0 || r.width < 2 || r.height < 2) out.obscured = null;
  else out.obscured = pts.every(([x, y]) => {
    const e = deepFromPoint(x, y);
    if (!e || e === a || a.contains(e) || e.contains(a)) return false;
    return opaque(e);
  });
}
return out;
})()`;
}

/** Is focus inside a dialog right now — for the trap test. */
export const IN_DIALOG_SCRIPT = String.raw`(() => {
${HELPERS}
const a = deepActive();
return !!(a && a.closest && a.closest('[role=dialog],[role=alertdialog],dialog,[aria-modal=true]'));
})()`;

/** Find a skip link among the given inventory indices. */
export function skipLinkFindScript(indices: number[]): string {
  return String.raw`(() => {
const nodes = (window.__pa && window.__pa.nodes) || [];
for (const i of ${JSON.stringify(indices)}) {
  const el = nodes[i];
  if (!el || el.tagName !== 'A') continue;
  const href = el.getAttribute('href') || '';
  if (!/^#[^\/!]/.test(href)) continue;
  const text = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
  if (!/\bskip\b|jump to|main content|zum inhalt|aller au contenu|saltar al contenido|vai al contenuto|naar de inhoud/i.test(text)) continue;
  const id = decodeURIComponent(href.slice(1));
  const target = document.getElementById(id) || document.getElementsByName(id)[0] || null;
  return { i, id, text: text.slice(0, 60), selector: el.tagName.toLowerCase() + (el.id ? '#' + el.id : ''), targetExists: !!target };
}
return null;
})()`;
}

export function skipLinkFocusScript(i: number): string {
  return String.raw`(() => {
const el = window.__pa.nodes[${i}];
window.scrollTo(0, 0);
el.focus();
window.__paHref = location.pathname + location.search;
return document.activeElement === el;
})()`;
}

/** After Enter then Tab on the skip link: did focus land in or after the target? */
export function skipLinkResultScript(id: string): string {
  return String.raw`(() => {
${HELPERS}
if (location.pathname + location.search !== window.__paHref) return null;
const target = document.getElementById(${JSON.stringify(id)}) || document.getElementsByName(${JSON.stringify(id)})[0];
const a = deepActive();
if (!target || !a || a === document.body) return null;
if (target === a || target.contains(a)) return true;
return !!(target.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING);
})()`;
}

/**
 * Text colour + the background layers beneath it, for a sample of the page's text.
 * Anything the colours alone cannot describe (images, gradients, translucency, shadows,
 * blend modes, text covered by another element) is counted as unmeasurable, not guessed.
 */
export const CONTRAST_SCRIPT = String.raw`(() => {
${HELPERS}
const SKIP = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|OPTION|TITLE)$/;
const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
const seen = new Set(); const cands = [];
let n;
while ((n = walker.nextNode()) && cands.length < 800) {
  const t = n.nodeValue.replace(/\s+/g, ' ').trim();
  if (t.length < 2 || !/[\p{L}\p{N}]/u.test(t)) continue;
  const el = n.parentElement;
  if (!el || seen.has(el) || SKIP.test(el.tagName)) continue;
  seen.add(el); cands.push([el, n]);
}
const stride = Math.max(1, Math.floor(cands.length / 150));
const samples = []; let unmeasurable = 0;
for (let k = 0; k < cands.length && samples.length < 150; k += stride) {
  const [el, node] = cands[k];
  if (!shown(el)) continue;
  if (el.closest(':disabled,[aria-disabled=true],[aria-hidden=true]')) continue;
  const range = document.createRange(); range.selectNodeContents(node);
  let rect = range.getClientRects()[0];
  if (!rect || rect.width < 4 || rect.height < 4) continue;
  if (rect.top < 0 || rect.bottom > innerHeight) {
    window.scrollTo(0, Math.max(0, rect.top + scrollY - innerHeight / 2));
    rect = range.getClientRects()[0];
    if (!rect || rect.top < 0 || rect.bottom > innerHeight) { unmeasurable++; continue; }
  }
  const cs = getComputedStyle(el);
  const fill = cs.webkitTextFillColor || cs.color;
  let bad = cs.textShadow !== 'none' || cs.webkitBackgroundClip === 'text' || cs.backgroundClip === 'text'
    || /rgba\([^)]*,\s*0\)$|transparent/.test(fill);
  for (let p = el; p && p.nodeType === 1 && !bad; p = p.parentElement) {
    const pc = getComputedStyle(p);
    if (parseFloat(pc.opacity) < 0.99 || pc.filter !== 'none' || pc.mixBlendMode !== 'normal') bad = true;
  }
  if (bad) { unmeasurable++; continue; }
  const x = Math.min(Math.max(rect.left + rect.width / 2, 0), innerWidth - 1), y = Math.min(Math.max(rect.top + rect.height / 2, 0), innerHeight - 1);
  const stack = document.elementsFromPoint(x, y);
  const at = stack.findIndex((e) => e === el || el.contains(e));
  if (at < 0 || stack.slice(0, at).some((e) => !el.contains(e) && opaque(e))) { unmeasurable++; continue; }
  const layers = []; let done = false;
  for (let s = at; s < stack.length && !done; s++) {
    const e = stack[s];
    if (s > at && el.contains(e)) continue;
    if (/^(IMG|VIDEO|CANVAS|PICTURE|IFRAME|OBJECT|EMBED)$/i.test(e.tagName) || (e.tagName.toLowerCase() === 'svg' && e !== el && !el.contains(e))) { bad = true; break; }
    const ec = getComputedStyle(e);
    if (ec.backgroundImage && ec.backgroundImage !== 'none') { bad = true; break; }
    for (const w of ['::before', '::after']) {
      const p = getComputedStyle(e, w);
      if (p.content !== 'none' && p.content !== 'normal' && p.position !== 'static' && (p.backgroundImage !== 'none' || !/rgba\([^)]*,\s*0\)$|transparent/.test(p.backgroundColor))) bad = true;
    }
    if (bad) break;
    if (e === document.documentElement || e === document.body) continue;
    layers.push(ec.backgroundColor);
    if (/^rgb\(/.test(ec.backgroundColor)) done = true;
  }
  if (bad) { unmeasurable++; continue; }
  if (!done) {
    // The root background paints the canvas; body's propagates when html has none.
    const hb = getComputedStyle(document.documentElement).backgroundColor;
    const bb = document.body ? getComputedStyle(document.body).backgroundColor : 'rgba(0, 0, 0, 0)';
    const transparent = (c) => /rgba\([^)]*,\s*0\)$/.test(c) || c === 'transparent';
    if (document.body && getComputedStyle(document.body).backgroundImage !== 'none') { unmeasurable++; continue; }
    if (getComputedStyle(document.documentElement).backgroundImage !== 'none') { unmeasurable++; continue; }
    if (!transparent(bb) && !transparent(hb)) layers.push(bb, hb);
    else if (!transparent(hb)) layers.push(hb);
    else if (!transparent(bb)) layers.push(bb);
  }
  samples.push({ ref: ref(el), fg: fill, layers, fontSizePx: parseFloat(cs.fontSize), fontWeight: parseInt(cs.fontWeight, 10) || 400 });
}
window.scrollTo(0, 0);
return { samples, unmeasurable };
})()`;

/** Every tappable control's box at the current (phone) viewport, with the exemptions observed. */
export const TARGETS_SCRIPT = String.raw`(() => {
${HELPERS}
if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
const Q = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=switch],[role=tab],[role=menuitem],[onclick]';
const els = allEls(document, []).filter((el) => el.matches(Q) && !el.matches(':disabled') && shown(el));
const vw = document.documentElement.clientWidth;
const items = [];
for (const el of els) {
  if (items.length >= 400) break;
  const r = el.getBoundingClientRect();
  if (r.right <= 0 || r.left >= vw) continue;
  // Visually hidden (the 1px "sr-only" pattern, e.g. a skip link until focused): not a tap target.
  if (r.width < 2 || r.height < 2) continue;
  const cs = getComputedStyle(el);
  // A control that ignores the pointer is not a target (a decorative product mock-up).
  if (cs.pointerEvents === 'none') continue;
  // Taken out of interaction by the author (tabindex=-1) or declared decorative (aria-hidden):
  // the mock-up UI in a product illustration. Skipping them can only under-report.
  const ti = el.getAttribute('tabindex');
  if ((ti !== null && parseInt(ti, 10) < 0) || el.closest('[aria-hidden=true]')) continue;
  let inline = false;
  if (el.tagName === 'A' && cs.display === 'inline' && el.parentElement) {
    const own = (el.textContent || '').trim().length;
    const around = (el.parentElement.textContent || '').trim().length;
    inline = around - own > 10;
  }
  const uaDefault = el.tagName === 'INPUT' && /^(checkbox|radio)$/.test(el.type) && cs.appearance === 'auto';
  items.push({ el, ref: ref(el), x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, inline, uaDefault, hitAreaOk: false });
}
let probes = 0;
for (const it of items) {
  if ((it.w >= 24 && it.h >= 24) || it.inline || it.uaDefault || probes >= 80) continue;
  probes++;
  it.el.scrollIntoView({ block: 'center', inline: 'center' });
  const r = it.el.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const hits = [[cx - 11.5, cy], [cx + 11.5, cy], [cx, cy - 11.5], [cx, cy + 11.5]].every(([x, y]) => {
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
    const e = deepFromPoint(x, y);
    return !!e && (e === it.el || it.el.contains(e));
  });
  it.hitAreaOk = hits;
}
window.scrollTo(0, 0);
return { viewportWidth: vw, items: items.map(({ el, ...rest }) => rest) };
})()`;
