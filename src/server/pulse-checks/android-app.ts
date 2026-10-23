// ─────────────────────────────────────────────────────────────────────────────
// NATIVE ANDROID (Kotlin / Java + Gradle) CHECK FAMILY.
//
// WHY THIS EXISTS. "Android app" has been selectable in the scan dropdown since
// before the iOS family shipped, but it had NO checks of its own — only the
// applicability skips that stop web-shaped checks failing a mobile repo. So a
// native Kotlin app was scored entirely on generic repo hygiene (README, .gitignore,
// CI, licence): exactly the hole iOS was in before §34.
//
// The findings mirror the ones the Flutter family (§34.6) found in the SAME client's
// codebases, because they are one house pattern rather than three teams' mistakes:
// tokens in plaintext preferences while a secure store sits unused, cleartext HTTP
// permitted app-wide, logging left on in release, and the environment selected by
// editing a source line.
//
// EVIDENCE MODEL (identical to ios-app.ts, and it matters):
//   • PRESENCE findings ("we found X") are sound on a sample — we saw it.
//   • ABSENCE findings ("no X anywhere") are NOT sound on a sample. Those declare
//     confidence: "LOW" when coverage is thin, which score-breakdown.ts excludes
//     from scoring and the UI shows as Inconclusive. A thin sample can therefore
//     never invent a failure.
//
// Comments are stripped from sampled source before matching (stripCStyleComments),
// because a commented-out guard is not a live guard — that bug shipped twice, in
// §34.3 and §34.6.
// ─────────────────────────────────────────────────────────────────────────────

import { CATEGORIES } from "./categories";
import type { PulseScanCheckInput } from "@/types/pulse";
import type { RepoSnapshot } from "./native-mobile";
import { isVendoredPath, nestsBlockComments, stripCStyleComments, sampleCoverage } from "./native-mobile";

/** Below this sampled-file coverage, absence findings self-downgrade to LOW. */
const SOUND_ABSENCE_COVERAGE = 0.3;

/**
 * Google Play's minimum target API level. Play rejects new apps and updates below
 * the floor, so this is a store-blocking finding rather than a style preference.
 * Bump this line each August when Play's requirement moves.
 */
const PLAY_TARGET_SDK_FLOOR = 35;

/** Density findings need a denominator — below this, they SKIP instead of guessing. */
const MIN_LINES_FOR_DENSITY = 200;

/** Convention plugins (build-logic / buildSrc / build-plugin): build configuration, not app source. */
export const ANDROID_BUILD_LOGIC_PATH = /(^|\/)(build-logic|buildSrc|build-plugin)\//i;
const GRADLE_FILE = /(^|\/)(build|settings)\.gradle(\.kts)?$/i;
const MANIFEST_FILE = /AndroidManifest\.xml$/i;
const VERSION_CATALOG = /(^|\/)gradle\/[^/]+\.versions\.toml$/i;

/** Strip a JVM file's comments by ITS language's rules — Kotlin nests block comments, Java does not. */
export function stripJvmFile(path: string, text: string): string {
  return stripCStyleComments(text, { nestedBlocks: nestsBlockComments(path) });
}

/**
 * The Android build inputs, shared by both Android families so they agree.
 *
 * Coverage is measured, not assumed: a multi-module app declares dozens of manifests
 * and build files, and a verdict that something is "not declared" is only sound when
 * every manifest was read (manifestCoverage === 1).
 */
export interface AndroidBuildInputs {
  /** All AndroidManifest.xml content read, joined. */
  manifest: string;
  /** Read manifests, by path. */
  manifests: { path: string; text: string }[];
  /** Fraction of the repo's manifests that were read (1 when there are none). */
  manifestCoverage: number;
  manifestsDeclared: number;
  /** Gradle build files + convention plugins, comments stripped, joined. */
  gradle: string;
  /** Gradle build files + convention plugins, by path (raw). */
  buildFiles: { path: string; text: string }[];
  /** Fraction of the repo's build/settings.gradle(.kts) files that were read (1 when there are none). */
  gradleCoverage: number;
  /** Version catalog text (empty when none was read). */
  catalog: string;
  /** A version catalog exists in the tree but was not read. */
  catalogUnread: boolean;
}

export function androidBuildInputs(snapshot: RepoSnapshot): AndroidBuildInputs {
  const declaredManifests = snapshot.paths.filter((p) => MANIFEST_FILE.test(p) && !isVendoredPath(p));
  const declaredGradle = snapshot.paths.filter((p) => GRADLE_FILE.test(p) && !isVendoredPath(p));
  const manifests: { path: string; text: string }[] = [];
  const buildFiles: { path: string; text: string }[] = [];
  let catalog = "";
  let gradleRead = 0;
  for (const [path, text] of snapshot.files) {
    if (isVendoredPath(path)) continue;
    if (MANIFEST_FILE.test(path)) manifests.push({ path, text });
    else if (GRADLE_FILE.test(path)) {
      buildFiles.push({ path, text });
      gradleRead++;
    } else if (ANDROID_BUILD_LOGIC_PATH.test(path) && /\.(kt|kts|gradle)$/i.test(path)) buildFiles.push({ path, text });
    else if (VERSION_CATALOG.test(path)) catalog += "\n" + text;
  }
  return {
    manifest: manifests.map((m) => m.text).join("\n"),
    manifests,
    manifestCoverage: declaredManifests.length === 0 ? 1 : Math.min(1, manifests.length / declaredManifests.length),
    manifestsDeclared: declaredManifests.length,
    // Build files carry commented-out config like any source file (`// isMinifyEnabled = true`).
    gradle: buildFiles.map((f) => stripJvmFile(f.path, f.text)).join("\n"),
    buildFiles,
    gradleCoverage: declaredGradle.length === 0 ? 1 : Math.min(1, gradleRead / declaredGradle.length),
    catalog,
    catalogUnread: snapshot.paths.some((p) => VERSION_CATALOG.test(p) && !snapshot.files.has(p)),
  };
}

interface AndroidContext extends AndroidBuildInputs {
  /** Sampled Kotlin/Java source with comments stripped — for "is this live code?" */
  source: string;
  /** Same source, comments intact — for signals that legitimately live in comments. */
  sourceRaw: string;
  /** Non-vendored source line count, for density metrics. */
  lines: number;
  /** Sampled fraction of the repo's Kotlin/Java files (0–1). */
  coverage: number;
  paths: string[];
  files: ReadonlyMap<string, string>;
}

/** App source: Kotlin/Java that is not vendored and not a Gradle convention plugin. */
const isAppSource = (p: string) => /\.(kt|java)$/i.test(p) && !isVendoredPath(p) && !ANDROID_BUILD_LOGIC_PATH.test(p);

function buildContext(snapshot: RepoSnapshot): AndroidContext {
  const sourcePaths = snapshot.paths.filter(isAppSource);
  const raw: string[] = [];
  const stripped: string[] = [];

  for (const [path, text] of snapshot.files) {
    if (!isAppSource(path)) continue;
    raw.push(text);
    // Per FILE, by the file's own language. Stripping the joined sample let one Java
    // banner comment (which nesting rules read as unclosed) delete every file after
    // it — 973,581 → 108,535 chars on NewPipe.
    stripped.push(stripJvmFile(path, text));
  }

  const sourceRaw = raw.join("\n");
  return {
    ...androidBuildInputs(snapshot),
    source: stripped.join("\n"),
    sourceRaw,
    lines: sourceRaw.split("\n").length,
    coverage: sampleCoverage(raw.length, sourcePaths.length, snapshot.truncated),
    paths: snapshot.paths,
    files: snapshot.files,
  };
}

/**
 * An ABSENCE finding: "we looked and did not find X". Sound only when the sample is
 * broad enough, so below the threshold it self-downgrades to LOW confidence and
 * drops out of scoring rather than reporting a failure we cannot support.
 */
function absence(
  ctx: AndroidContext,
  check: Omit<PulseScanCheckInput, "confidence">,
): PulseScanCheckInput {
  // A PASS means we SAW the thing — a presence finding, sound on any sample. Only a
  // "not found" verdict depends on coverage, so only that gets the caveat and LOW.
  const sound = check.status === "PASS" || ctx.coverage >= SOUND_ABSENCE_COVERAGE;
  return {
    ...check,
    confidence: sound ? "HIGH" : "LOW",
    detail: sound
      ? check.detail
      : `${check.detail} (Based on ${Math.round(ctx.coverage * 100)}% of this app's Kotlin/Java files — ` +
        `below the threshold for a confident "not present anywhere", so this is inconclusive rather than a failure.)`,
  };
}

/**
 * A verdict that rests on something NOT being declared in any manifest ("no
 * POST_NOTIFICATIONS", "no unguarded provider"). Sound only when every manifest in
 * the repo was read; otherwise it is reported as INCONCLUSIVE rather than as a
 * finding about manifests nobody looked at (§35: "we could not look" is not "it is
 * not there"). Manifests MERGE at build time, so one unread manifest can change it.
 */
export function manifestAbsence(
  inputs: Pick<AndroidBuildInputs, "manifestCoverage" | "manifests" | "manifestsDeclared">,
  check: PulseScanCheckInput,
): PulseScanCheckInput {
  if (inputs.manifestCoverage >= 1) return check;
  return {
    ...check,
    status: "INCONCLUSIVE",
    confidence: "LOW",
    confidenceReason:
      `Only ${inputs.manifests.length} of ${inputs.manifestsDeclared} AndroidManifest.xml files were read, so a ` +
      `declaration in an unread one cannot be ruled out.`,
    detail:
      `${check.detail} (Only ${inputs.manifests.length} of ${inputs.manifestsDeclared} AndroidManifest.xml files in ` +
      `this repo were read, and the manifests merge at build time — so whether this holds for the shipped app is ` +
      `not established.)`,
  };
}

// ── Build toggles (minify / shrinkResources) — one predicate, both families ────
export type GradleToggle = "on" | "off" | "computed" | "unset";

/**
 * How a Gradle boolean (minifyEnabled / shrinkResources) is set, across all forms:
 * `minifyEnabled true`, `minifyEnabled = true`, `isMinifyEnabled = true`, and an
 * expression. An expression that DEFAULTS to a literal (`…getOrElse(true)`,
 * `?: true`, `.orElse(false)`) is read as that default; any other expression
 * (`!isCI.get()`, `project.hasProperty("x")`) cannot be evaluated from source and is
 * "computed". Precedence: on > computed > off — a debug block's literal `false` must
 * not hide a release block's computed value.
 *
 * Both Android families call this so they can never disagree (they did: one said
 * WARN HIGH and the other LOW on the same thunderbird build file).
 */
export function gradleToggleState(gradle: string, name: "minify" | "shrinkResources"): GradleToggle {
  const key = name === "minify" ? "(?:is)?[Mm]inifyEnabled" : "(?:is)?[Ss]hrinkResources";
  // The value: up to the end of the line, plus any `.chained()` continuation lines.
  const assign = new RegExp(`\\b${key}\\b[ \\t]*=?[ \\t]*([^\\n]*(?:\\n[ \\t]*\\.[^\\n]*)*)`, "g");
  let on = false;
  let off = false;
  let computed = false;
  for (const m of gradle.matchAll(assign)) {
    const value = m[1].trim().replace(/;+$/, "").trim();
    if (!value) continue;
    if (/^\(?\s*true\b/.test(value)) on = true;
    else if (/^\(?\s*false\b/.test(value)) off = true;
    else if (/(?:\.(?:getOrElse|orElse)\(\s*true\s*\)|\?:\s*true\b)\s*$/.test(value)) on = true;
    else if (/(?:\.(?:getOrElse|orElse)\(\s*false\s*\)|\?:\s*false\b)\s*$/.test(value)) off = true;
    else if (/^[!A-Za-z_(]/.test(value)) computed = true;
  }
  return on ? "on" : computed ? "computed" : off ? "off" : "unset";
}

// ── SDK levels ────────────────────────────────────────────────────────────────
/** Paths whose SDK levels describe a test/benchmark module, not the shipped app. */
const NON_APP_MODULE = /(^|\/)(benchmarks?|baselineprofile|macrobenchmark|testing|test-?app)(\/|$)|(^|\/)src\/(test|androidTest)\/|BaselineProfile/i;
/** A build file that applies the Android APPLICATION plugin (directly or via a convention alias). */
const APPLIES_APP_PLUGIN = /com\.android\.application|android[.-]application\b|\.app\.android\b/i;

/**
 * Resolve every minSdk / targetSdk value the build declares, from Gradle files and
 * convention plugins: literals (`minSdk = 24`, `minSdkVersion 21`), the DSL block
 * form (`minSdk { version = release(23) }`), and constants
 * (`minSdk = ProjectConfig.Android.sdkMin` + `const val sdkMin = 24`, or a version
 * catalog entry). `app` holds values from files that apply the application plugin;
 * `other` the rest. Test/benchmark modules are ignored.
 *
 * Exported because "which number is the app's" is the whole check: the first-match
 * read a benchmark module's `minSdk = 28` while the app's 24 sat in a convention
 * plugin.
 */
export function resolveSdkLevels(
  buildFiles: { path: string; text: string }[],
  which: "minSdk" | "targetSdk",
  catalog = "",
): { app: number[]; other: number[] } {
  const all = buildFiles.map((f) => f.text).join("\n");
  const constant = (name: string): number | null => {
    const m = new RegExp(`\\b(?:const\\s+)?val\\s+${name}\\s*(?::\\s*Int)?\\s*=\\s*(\\d{1,2})\\b`).exec(all);
    if (m) return Number(m[1]);
    // `libs.versions.androidMinSdk.get().toInt()` → `androidMinSdk = "24"` in the catalog.
    const t = new RegExp(`^\\s*${name.replace(/\./g, "[.-]")}\\s*=\\s*"(\\d{1,2})"`, "m").exec(catalog);
    return t ? Number(t[1]) : null;
  };
  const resolve = (expr: string): number | null => {
    const e = expr.trim();
    const lit = /^(\d{1,2})\b/.exec(e) ?? /^release\(\s*(\d{1,2})\s*\)/.exec(e);
    if (lit) return Number(lit[1]);
    const call = /^release\(\s*([\w.]+)\s*\)/.exec(e);
    const ident = call?.[1] ?? /^([A-Za-z_][\w.]*)/.exec(e)?.[1];
    if (!ident) return null;
    if (/^libs\.versions\./.test(ident)) return constant(ident.replace(/^libs\.versions\./, "").replace(/\.get$/, ""));
    return constant(ident.split(".").pop()!);
  };
  const keyRe = which === "minSdk" ? "minSdk(?:Version)?" : "targetSdk(?:Version)?";
  // `lint.targetSdk` / `testOptions.targetSdk` describe tooling, not the app — hence the lookbehind.
  const re = new RegExp(`(?<![\\w.])(?:defaultConfig\\.)?${keyRe}\\b\\s*(?:\\{\\s*version\\s*=\\s*|=\\s*|\\s+)([^\\n{}]+)`, "g");
  const app: number[] = [];
  const other: number[] = [];
  for (const f of buildFiles) {
    if (NON_APP_MODULE.test(f.path)) continue;
    const appFile = APPLIES_APP_PLUGIN.test(f.text) || /application/i.test(f.path.split("/").pop() ?? "");
    for (const m of f.text.matchAll(re)) {
      const v = resolve(m[1]);
      if (v === null) continue;
      (appFile ? app : other).push(v);
    }
  }
  return { app, other };
}

// ── App Links ownership ───────────────────────────────────────────────────────
/** Registrable domain of a host, with the common two-level ccTLD suffixes. */
function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/^\*\./, "").replace(/\/.*$/, "").split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const twoLevel = /^(co|com|org|net|ac|gov|edu)$/.test(labels[labels.length - 2]) && labels[labels.length - 1].length === 2;
  return labels.slice(twoLevel ? -3 : -2).join(".");
}

/** The app's own identifiers (manifest package, applicationId, namespace, *APPLICATION_ID constants). */
function appIdentifiers(ctx: { manifest: string; gradle: string }): string[] {
  const ids = new Set<string>();
  for (const m of ctx.manifest.matchAll(/\bpackage\s*=\s*"([\w.]+)"/g)) ids.add(m[1]);
  for (const m of ctx.gradle.matchAll(/\b(?:applicationId|namespace)\s*=?\s*"([\w.]+)"/g)) ids.add(m[1]);
  for (const m of ctx.gradle.matchAll(/\bval\s+\w*APPLICATION_ID\w*\s*=\s*"([\w.]+)"/gi)) ids.add(m[1]);
  return [...ids].filter((id) => id.split(".").length >= 2);
}

/** `com.google.samples.apps.x` → `google.com`; `uk.co.acme.app` → `acme.co.uk`. */
function domainOfAppId(id: string): string {
  const parts = id.toLowerCase().split(".");
  const cc = parts[0].length === 2 && /^(co|com|org|net|ac|gov|edu)$/.test(parts[1] ?? "");
  return (cc ? parts.slice(0, 3) : parts.slice(0, 2)).reverse().join(".");
}

// ── Exported components ───────────────────────────────────────────────────────
/**
 * Actions whose whole point is to be invoked by other apps or by the system: a share
 * target, a document picker, a media button, a widget, a media browser, a launcher
 * shortcut, protected broadcasts only the system can send, and two documented
 * cross-app protocols. An exported component that handles ONLY these is public by
 * contract, not by accident.
 */
const PUBLIC_CONTRACT_ACTIONS = new Set([
  "android.intent.action.SEND",
  "android.intent.action.SEND_MULTIPLE",
  "android.intent.action.SENDTO",
  "android.intent.action.GET_CONTENT",
  "android.intent.action.PICK",
  "android.intent.action.OPEN_DOCUMENT",
  "android.intent.action.PROCESS_TEXT",
  "android.intent.action.MEDIA_BUTTON",
  "android.media.action.MEDIA_PLAY_FROM_SEARCH",
  "android.nfc.action.NDEF_DISCOVERED",
  "android.intent.action.SEARCH",
  "android.intent.action.CREATE_SHORTCUT",
  "android.appwidget.action.APPWIDGET_UPDATE",
  "android.media.browse.MediaBrowserService",
  "androidx.media3.session.MediaSessionService",
  "androidx.media3.session.MediaLibraryService",
  "android.service.quicksettings.action.QS_TILE",
  "android.intent.action.BOOT_COMPLETED",
  "android.intent.action.LOCKED_BOOT_COMPLETED",
  "android.intent.action.MY_PACKAGE_REPLACED",
  "android.intent.action.LOCALE_CHANGED",
  "android.intent.action.TIMEZONE_CHANGED",
  "android.intent.action.TIME_SET",
  "android.intent.action.DEVICE_STORAGE_LOW",
  "android.intent.action.DEVICE_STORAGE_OK",
  "android.intent.action.APPLICATION_LOCALE_CHANGED",
  // Documented cross-app protocols whose purpose is to be invoked by other apps:
  // PanicKit (a panic-button app triggers responders) and Autocrypt peer actions.
  "info.guardianproject.panic.action.TRIGGER",
  "org.autocrypt.PEER_ACTION",
]);

/** Exported components that are NOT public by contract and carry no permission guard (by android:name). */
export function riskyExportedComponents(manifest: string): string[] {
  const risky: string[] = [];
  const elements =
    manifest.match(/<(activity-alias|activity|service|receiver|provider)\b[^>]*?(?:\/>|>[\s\S]*?<\/\1\s*>)/gi) ?? [];
  for (const el of elements) {
    const openTag = /^<[^>]*>/.exec(el)?.[0] ?? "";
    if (!/android:exported\s*=\s*"true"/i.test(openTag)) continue;
    if (/android:permission\s*=/i.test(openTag)) continue;
    const filters = el.match(/<intent-filter\b[\s\S]*?<\/intent-filter\s*>/gi) ?? [];
    const publicFilter = (f: string) => {
      const actions = [...f.matchAll(/<action\b[^>]*android:name\s*=\s*"([^"]+)"/gi)].map((m) => m[1]);
      const categories = [...f.matchAll(/<category\b[^>]*android:name\s*=\s*"([^"]+)"/gi)].map((m) => m[1]);
      if (categories.some((c) => /\.category\.(LAUNCHER|HOME|LEANBACK_LAUNCHER)$/.test(c))) return true;
      if (actions.length === 0) return false;
      return actions.every(
        (a) =>
          PUBLIC_CONTRACT_ACTIONS.has(a) ||
          a === "android.intent.action.MAIN" ||
          // VIEW is public as a browsable link target, or for a standard scheme / MIME type other
          // apps hand over (mailto:, a shared file). A VIEW on the app's own custom scheme with no
          // BROWSABLE is an internal route that any app can open — that stays a finding.
          (a === "android.intent.action.VIEW" &&
            (categories.includes("android.intent.category.BROWSABLE") ||
              /android:mimeType\s*=|android:scheme\s*=\s*"(?:https?|mailto|tel|sms|smsto|mms|geo|content|file|market)"/i.test(f))),
      );
    };
    if (filters.length > 0 && filters.every(publicFilter)) continue;
    risky.push(/android:name\s*=\s*"([^"]+)"/i.exec(openTag)?.[1] ?? openTag.slice(1, openTag.indexOf(" ")));
  }
  return risky;
}

/**
 * PendingIntent creation sites and whether each is immutable.
 *
 * `PendingIntent.get*(…, flags)` states mutability in the flags (FLAG_IMMUTABLE /
 * FLAG_MUTABLE). androidx `PendingIntentCompat.get*(…, flags, isMutable)` states it in
 * its LAST argument and adds the flag itself — NewPipe's `PendingIntentCompat.getActivity(
 * ctx, id, intent, 0, false)` is immutable with no FLAG_IMMUTABLE anywhere. Both
 * families use this so they agree.
 */
export function pendingIntentSites(source: string): { count: number; immutable: boolean; mutable: boolean } {
  let count = 0;
  let immutable = false;
  let mutable = false;
  for (const m of source.matchAll(/\bPendingIntent(Compat)?\.(?:getActivity|getActivities|getService|getBroadcast|getForegroundService)\s*\(/g)) {
    count++;
    const open = (m.index ?? 0) + m[0].length - 1;
    let depth = 0;
    let end = open;
    for (let i = open; i < source.length && i < open + 2000; i++) {
      if (source[i] === "(") depth++;
      else if (source[i] === ")" && --depth === 0) {
        end = i;
        break;
      }
    }
    const args = source.slice(open + 1, end);
    if (/FLAG_IMMUTABLE/.test(args)) immutable = true;
    if (/FLAG_MUTABLE/.test(args)) mutable = true;
    if (m[1]) {
      const last = /,\s*(true|false)\s*$/.exec(args)?.[1];
      if (last === "false") immutable = true;
      if (last === "true") mutable = true;
    }
  }
  // A flags constant assembled elsewhere (`val flags = … or FLAG_IMMUTABLE`) still counts.
  if (count > 0 && /FLAG_IMMUTABLE/.test(source)) immutable = true;
  if (count > 0 && /FLAG_MUTABLE/.test(source)) mutable = true;
  return { count, immutable, mutable };
}

/** The bodies of every `release { … }` / `getByName("release") { … }` block in a build file. */
function releaseBlocks(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\b(?:release|getByName\(\s*"release"\s*\)|named\(\s*"release"\s*\))\s*\{/g)) {
    let depth = 0;
    const start = (m.index ?? 0) + m[0].length - 1;
    for (let i = start; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}" && --depth === 0) {
        out.push(text.slice(start + 1, i));
        break;
      }
    }
  }
  return out;
}

/**
 * True when the SQL argument of a rawQuery/execSQL call is built from a NON-constant value — by concatenation
 * (`"… = " + id`) or by a Kotlin template (`"… = $id"`). Concatenating string literals, numbers or SCREAMING_CASE
 * constants (`"DROP TABLE " + TABLE_NAME`) cannot be injected. Only the FIRST argument is judged: the bind-args
 * array (`arrayOf(a + b)`, `arrayOf("$id")`) is the parameterised path, not an injection.
 */
/** A SCREAMING_CASE constant, optionally qualified (`TABLE_NAME`, `Contract.Entry.COLUMN_ID`). */
const SQL_CONSTANT = /^(?:\w+\.)*[A-Z][A-Z0-9]*(?:_[A-Za-z0-9]+)*$/;

export function concatenatedSql(source: string): boolean {
  // Kotlin raw strings (`"""…"""`, often multi-line SQL) first, so a template inside one is still judged.
  const literal = /"""[\s\S]*?"""|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g;
  const start = /\b(?:rawQuery|execSQL)\(\s*(?=["'])/g;
  for (const m of source.matchAll(start)) {
    const open = source.indexOf("(", m.index ?? 0);
    const window = source.slice(open, open + 2000);
    // Same-length mask so parentheses and commas inside literals do not move the argument boundaries.
    const masked = window.replace(literal, (l) => '"' + " ".repeat(Math.max(0, l.length - 2)) + '"');
    let depth = 0;
    let end = window.length;
    for (let i = 0; i < masked.length; i++) {
      const c = masked[i];
      if (c === "(") depth++;
      else if (c === ")" && --depth === 0) {
        end = i;
        break;
      } else if (c === "," && depth === 1) {
        end = i;
        break;
      }
    }
    const sqlArg = window.slice(1, end);
    // Kotlin templates: `$name` / `${expr}` interpolate a value unless it names a constant (`${Contract.TABLE}`).
    // `\$` is an escaped dollar, not a template.
    const templated = [...sqlArg.matchAll(literal)]
      .filter((l) => l[0].startsWith('"'))
      .flatMap((l) => [...l[0].matchAll(/(?<!\\)\$(?:\{([^}]*)\}|([A-Za-z_]\w*))/g)])
      .some((t) => !SQL_CONSTANT.test((t[1] ?? t[2] ?? "").trim()));
    if (templated) return true;
    const args = sqlArg.replace(literal, '""');
    const operands = [...args.matchAll(/\+\s*(""|[A-Za-z_][\w.]*|\S)/g)].map((o) => o[1]);
    if (operands.some((op) => op !== '""' && !/^\d/.test(op) && !SQL_CONSTANT.test(op))) return true;
  }
  return false;
}

export function evaluateAndroidChecks(snapshot: RepoSnapshot): PulseScanCheckInput[] {
  if (!snapshot.accessible) return [];
  const ctx = buildContext(snapshot);
  const checks: PulseScanCheckInput[] = [];

  checks.push(...securityChecks(ctx));
  checks.push(...componentSecurityChecks(ctx));
  checks.push(...secretsChecks(ctx));
  checks.push(...storeReadinessChecks(ctx));
  checks.push(...qualityChecks(ctx));
  checks.push(...platformQualityChecks(ctx));

  return checks;
}

// ── Component & IPC security ────────────────────────────────────────────────
//
// Everything in this section is about the boundary between this app and OTHER
// apps on the same device. Android's defaults here are permissive for historical
// reasons, so each of these is a case where doing nothing is the insecure choice.
function componentSecurityChecks(ctx: AndroidContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];

  // PendingIntent mutability. A mutable PendingIntent handed to another app lets
  // that app fill in the blanks and have YOUR app execute the result.
  // PendingIntentCompat (androidx) is the same API and must count too (pendingIntentSites).
  const { count: pendingIntents, immutable, mutable } = pendingIntentSites(ctx.source);
  if (pendingIntents > 0) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "android_pending_intent_mutability",
      label: "PendingIntents are immutable",
      status: immutable ? (mutable ? "WARN" : "PASS") : "WARN",
      confidence: "MEDIUM",
      detail: immutable && !mutable
        ? `${pendingIntents} PendingIntent(s) created, with FLAG_IMMUTABLE in use.`
        : immutable && mutable
          ? `${pendingIntents} PendingIntent(s) created; both FLAG_IMMUTABLE and FLAG_MUTABLE appear. A mutable ` +
            `PendingIntent is only safe when the recipient is trusted AND the base Intent names an explicit ` +
            `component — check each FLAG_MUTABLE site for both.`
          : `${pendingIntents} PendingIntent(s) created with no FLAG_IMMUTABLE anywhere in the sampled source. A ` +
            `PendingIntent runs with YOUR app's identity and permissions; if it is mutable, whichever app receives ` +
            `it can fill in the unset fields — including the target component — and have your app perform an action ` +
            `of their choosing. Android 12+ requires the flag to be stated explicitly for exactly this reason. Use ` +
            `FLAG_IMMUTABLE unless you have a specific need not to.`,
      evidence: `${pendingIntents} PendingIntent(s)`,
    });
  }

  // Task hijacking (StrandHogg). Default taskAffinity lets a malicious app insert
  // its activity into your task and present a convincing fake login screen.
  const hasLauncher = /android\.intent\.category\.LAUNCHER/.test(ctx.manifest);
  if (hasLauncher) {
    const defended = /android:taskAffinity\s*=\s*""|android:launchMode\s*=\s*"singleTask"|android:launchMode\s*=\s*"singleInstance"/i.test(ctx.manifest);
    // "No defence declared" is a claim about every manifest.
    const push = (c: PulseScanCheckInput) => checks.push(defended ? c : manifestAbsence(ctx, c));
    push({
      category: CATEGORIES.SECURITY,
      checkKey: "android_task_hijacking",
      label: "Activities are protected against task hijacking",
      status: defended ? "PASS" : "WARN",
      confidence: "MEDIUM",
      detail: defended
        ? `Task affinity or launch mode is set to limit task reuse.`
        : `No \`android:taskAffinity=""\` and no \`singleTask\`/\`singleInstance\` launch mode. By default every ` +
          `activity shares a task affinity derived from the package name, which lets another installed app declare ` +
          `the same affinity and have ITS activity appear inside your task — the user taps your icon and is shown ` +
          `the attacker's screen, styled like yours. This is the StrandHogg class of attack, and it needs no ` +
          `permissions. Set \`android:taskAffinity=""\` on activities that handle credentials or payment.`,
    });
  }

  // sharedUserId collapses the sandbox between apps signed with the same key.
  if (/android:sharedUserId\s*=/i.test(ctx.manifest)) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "android_shared_user_id",
      label: "sharedUserId is not used",
      status: "WARN",
      confidence: "HIGH",
      detail:
        `\`android:sharedUserId\` is declared. It puts this app in the same Linux UID as every other app declaring ` +
        `the same id, so they share a sandbox and can read each other's private files directly. A compromise of any ` +
        `one of them is a compromise of all. It is deprecated — Android has been removing support — and migrating ` +
        `away later is disruptive because the UID is baked into installed copies. Use explicit IPC (a bound service, ` +
        `or a content provider with a signature-level permission) instead.`,
    });
  }

  // Custom permissions at protectionLevel normal/dangerous can be acquired by any
  // app that asks; signature-level restricts them to your own signing key.
  const customPermissions = (ctx.manifest.match(/<permission\b/gi) ?? []).length;
  if (customPermissions > 0) {
    const signatureLevel = /android:protectionLevel\s*=\s*"signature/i.test(ctx.manifest);
    const push = (c: PulseScanCheckInput) => checks.push(signatureLevel ? c : manifestAbsence(ctx, c));
    push({
      category: CATEGORIES.SECURITY,
      checkKey: "android_custom_permission_level",
      label: "Custom permissions use signature protection",
      status: signatureLevel ? "PASS" : "WARN",
      confidence: "MEDIUM",
      detail: signatureLevel
        ? `${customPermissions} custom permission(s) declared, with signature-level protection in use.`
        : `${customPermissions} custom permission(s) declared with no \`android:protectionLevel="signature"\`. At ` +
          `\`normal\` the permission is granted automatically to any app that requests it, and at \`dangerous\` it is ` +
          `one user tap away — so a permission meant to restrict a component to your own apps restricts it to ` +
          `nobody. Worse, a malicious app can define your permission FIRST if it installs before you. Use ` +
          `\`signature\`, which binds the grant to your signing key.`,
    });
  }

  // Content providers are exported by default below API 17 and are a direct
  // read/write path into app data when left open.
  // Judge each <provider> on its OWN opening tag. A lazy [\s\S]*? across the whole
  // manifest paired NewPipe's exported="false" FileProvider with a LATER activity's
  // exported="true" — and could equally borrow a later element's permission.
  const providerTags = ctx.manifest.match(/<provider\b[^>]*>/gi) ?? [];
  const providers = providerTags.length;
  if (providers > 0) {
    const openProvider = providerTags.some(
      (tag) =>
        /android:exported\s*=\s*"true"/i.test(tag) &&
        !/android:(permission|readPermission|writePermission)\s*=/i.test(tag),
    );
    // A PASS here means "no unguarded provider in the manifests we READ" — with any
    // manifest unread that is not established (thunderbird: an unread one exports one).
    const push = (c: PulseScanCheckInput) => checks.push(openProvider ? c : manifestAbsence(ctx, c));
    push({
      category: CATEGORIES.SECURITY,
      checkKey: "android_content_provider_exposure",
      label: "Content providers are not openly exported",
      status: openProvider ? "WARN" : "PASS",
      confidence: "MEDIUM",
      detail: openProvider
        ? `A \`<provider>\` is exported with no \`android:permission\`, \`readPermission\` or \`writePermission\`. A ` +
          `content provider is a direct query interface to app data — an exported, unguarded one lets any installed ` +
          `app read (and often write) whatever it backs, with no user prompt. If it exists only to share files with ` +
          `other apps, use \`FileProvider\` with \`grantUriPermissions\` and per-URI grants instead of blanket export.`
        : `${providers} content provider(s) declared, either not exported or permission-guarded.`,
    });
  }

  // WebView file access. Combined with universal access from file URLs, a
  // malicious local HTML file can read every file the app can.
  if (/WebView|webView/.test(ctx.source)) {
    const fileAccess = /setAllowFileAccess\s*\(\s*true|setAllowFileAccessFromFileURLs\s*\(\s*true/.test(ctx.source);
    const universalAccess = /setAllowUniversalAccessFromFileURLs\s*\(\s*true/.test(ctx.source);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "android_webview_file_access",
      label: "WebView file access is disabled",
      status: universalAccess ? "FAIL" : fileAccess ? "WARN" : "PASS",
      confidence: "HIGH",
      detail: universalAccess
        ? `\`setAllowUniversalAccessFromFileURLs(true)\` lets content loaded from a \`file://\` URL make requests to ` +
          `ANY origin and read the responses — bypassing the same-origin policy entirely. Any HTML that reaches the ` +
          `WebView from disk (a downloaded file, a cache entry another app can write) can then read the app's private ` +
          `files and exfiltrate them. Set it to false; Android defaults it off from API 30 for this reason.`
        : fileAccess
          ? `\`setAllowFileAccess(true)\` permits the WebView to load \`file://\` URLs. Combined with any path the ` +
            `app writes from untrusted input, this becomes a local file read. Disable it unless the app genuinely ` +
            `renders local HTML, and use \`WebViewAssetLoader\` if it does.`
          : `WebView file access is not explicitly enabled.`,
    });
  }

  // Raw SQL built by concatenation.
  if (/rawQuery\s*\(|execSQL\s*\(/.test(ctx.source)) {
    // Shared with the extended family (concatenatedSql): concatenating literals,
    // numbers or SCREAMING_CASE constants cannot be injected. The old regex treated
    // NewPipe's `execSQL("DROP TABLE " + MISSIONS_TABLE_NAME_v2)` as injection.
    // A lower-case identifier as the FIRST operand (`rawQuery(sql + id)`) is a
    // variable and is judged here, because concatenatedSql only reads calls that
    // start with a literal.
    const concatenated =
      concatenatedSql(ctx.source) ||
      /(rawQuery|execSQL)\s*\(\s*[a-z_]\w*\s*\+/.test(ctx.source);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "android_sql_injection",
      label: "SQL queries are parameterised",
      status: concatenated ? "FAIL" : "PASS",
      confidence: "MEDIUM",
      detail: concatenated
        ? `A \`rawQuery\`/\`execSQL\` call builds its SQL by string concatenation or interpolation. Any user-supplied ` +
          `value reaching it can change the query — read other users' cached rows, or drop the table. Pass values as ` +
          `\`selectionArgs\` with \`?\` placeholders, which SQLite binds rather than parses. If the app syncs data ` +
          `from your API, remember the "user input" here includes anything the server sent.`
        : `Raw SQL calls are present and do not appear to concatenate values into the statement.`,
    });
  }

  // Sensitive data on external storage is world-readable on older API levels and
  // survives uninstall.
  if (/getExternalStorage(Directory|PublicDirectory)|Environment\.getExternalStorage/.test(ctx.source)) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "android_external_storage",
      label: "Sensitive files are not written to shared storage",
      status: "WARN",
      confidence: "MEDIUM",
      detail:
        `The app writes to shared external storage (\`Environment.getExternalStorageDirectory\`). Files there are ` +
        `outside the app sandbox: readable by other apps on older API levels, retained after your app is uninstalled, ` +
        `and backed up to the user's cloud account. Use \`context.getFilesDir()\` for anything private, or ` +
        `\`getExternalFilesDir()\` for large non-sensitive caches — the latter is at least removed on uninstall.`,
    });
  }

  return checks;
}

// ── Platform quality: deep links, notifications, threading, dependencies ────
function platformQualityChecks(ctx: AndroidContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];

  // App Links verification. Without autoVerify, the OS shows a disambiguation
  // dialog (or opens the browser) instead of your app.
  const hasHttpIntentFilter = /<data[^>]*android:scheme\s*=\s*"https?"/i.test(ctx.manifest);
  if (hasHttpIntentFilter) {
    const autoVerify = /android:autoVerify\s*=\s*"true"/i.test(ctx.manifest);
    // App Links can only be verified on a domain whose /.well-known/assetlinks.json
    // the app's owner can publish. NewPipe handles youtube.com and youtu.be links —
    // it cannot verify them and is not expected to. When none of the linked hosts
    // shares a registrable domain with the app's own identifier, whether the app
    // owns them is not something the repo can tell us.
    const hosts = [...ctx.manifest.matchAll(/android:host\s*=\s*"([^"]+)"/gi)].map((m) => m[1]);
    const ownDomains = appIdentifiers(ctx).map(domainOfAppId);
    const ownsAHost = hosts.some((h) => ownDomains.includes(registrableDomain(h)));
    const ownershipUnknown = !autoVerify && ownDomains.length > 0 && hosts.length > 0 && !ownsAHost;
    checks.push({
      category: CATEGORIES.APP_STORE,
      checkKey: "android_app_links_verified",
      label: "HTTP deep links are verified App Links",
      status: autoVerify ? "PASS" : ownershipUnknown ? "INCONCLUSIVE" : "WARN",
      confidence: autoVerify ? "HIGH" : ownershipUnknown ? "LOW" : ownDomains.length > 0 ? "HIGH" : "MEDIUM",
      detail: autoVerify
        ? `\`android:autoVerify="true"\` is set — confirm \`/.well-known/assetlinks.json\` is served on the domain, ` +
          `since verification fails silently if it is missing or malformed.`
        : ownershipUnknown
          ? `The app handles http/https links for ${hosts.slice(0, 4).join(", ")}${hosts.length > 4 ? ` and ${hosts.length - 4} more` : ""} ` +
            `without \`android:autoVerify\`, but none of these hosts shares a domain with the app's own identifier ` +
            `(${ownDomains.join(", ")}). Verification needs \`assetlinks.json\` published on the linked domain, which an ` +
            `app can only do for domains it owns — links to third-party sites cannot be verified and are not expected ` +
            `to be. If one of these domains IS yours, add \`autoVerify\` for it.`
          : `The app registers an intent filter for http/https links without \`android:autoVerify="true"\`. Unverified ` +
            `links do not open the app directly: Android shows a "open with" chooser, or just opens the browser — so ` +
            `every marketing link, password reset and share link lands on the website instead of the app, and any ` +
            `other app can claim the same links. Add \`autoVerify\` and publish \`assetlinks.json\` with your signing ` +
            `certificate fingerprint.`,
    });
  }

  // POST_NOTIFICATIONS became a runtime permission at API 33; apps that never
  // request it silently stop notifying anyone on modern devices.
  const usesNotifications = /NotificationManager|NotificationCompat|FirebaseMessagingService/.test(ctx.source) ||
    /com\.google\.firebase\.MESSAGING_EVENT/.test(ctx.manifest);
  if (usesNotifications) {
    const requestsPermission = /POST_NOTIFICATIONS/.test(ctx.manifest + ctx.source);
    const notif: PulseScanCheckInput = {
      category: CATEGORIES.MOBILE,
      checkKey: "android_notification_permission",
      label: "POST_NOTIFICATIONS is requested",
      status: requestsPermission ? "PASS" : "FAIL",
      confidence: "HIGH",
      detail: requestsPermission
        ? `\`POST_NOTIFICATIONS\` is declared — confirm the app also requests it at runtime and handles a refusal.`
        : `The app posts notifications but never declares \`android.permission.POST_NOTIFICATIONS\`. Since Android 13 ` +
          `(API 33) that is a runtime permission, and without it notifications are silently dropped — no error, no ` +
          `log, nothing in the tray. On any modern device this app's notifications simply do not arrive, which is ` +
          `usually reported as "push isn't working" and debugged on the server side for a long time first.`,
    };
    // "Never declared" is a claim about EVERY manifest (they merge at build time).
    // thunderbird declares it in three manifests the old 60-file cap never read.
    checks.push(requestsPermission ? notif : manifestAbsence(ctx, notif));
  }

  // Network on the main thread. StrictMode catches this in development; in
  // production it is ANRs.
  const mainThreadIo = /\.permitAll\s*\(\)|StrictMode\.setThreadPolicy[\s\S]{0,120}permitNetwork/.test(ctx.source);
  if (mainThreadIo) {
    checks.push({
      category: CATEGORIES.PERFORMANCE,
      checkKey: "android_main_thread_io",
      label: "Main-thread network policy is not relaxed",
      status: "WARN",
      confidence: "HIGH",
      detail:
        `A StrictMode thread policy calls \`permitAll()\` (or explicitly permits network), which disables the guard ` +
        `that stops network and disk I/O running on the UI thread. That guard exists because main-thread I/O is the ` +
        `direct cause of ANRs — the system kills an app whose UI thread is blocked for 5 seconds, and Play Console ` +
        `surfaces the ANR rate as a store-quality metric. Move the work to a coroutine or executor rather than ` +
        `silencing the detector.`,
    });
  }

  // Dynamic version ranges make builds non-reproducible and pull unreviewed code.
  // Versions live in the build files AND (in most modern projects) the version
  // catalog, so a PASS needs both read: a catalog that exists unread, or build
  // files left unread by the cap, make "no dynamic versions" unestablished.
  const dynamicVersions =
    /(implementation|api|compileOnly)\s*\(?\s*["'][^"']*:(\+|latest\.release|\d+\.\+)["']/i.test(ctx.gradle) ||
    /^\s*[\w.-]+\s*=\s*(?:"(?:\+|[\d.]*\.\+|latest\.[a-z]+|[[(][^"]*,[^"]*[\])])"|\{[^}\n]*(?:require|strictly|prefer)\s*=\s*"(?:\+|[\d.]*\.\+|latest\.[a-z]+|[[(][^"]*,[^"]*[\])])")/im.test(ctx.catalog);
  if (ctx.gradle) {
    const unread = !dynamicVersions && (ctx.catalogUnread || ctx.gradleCoverage < 1);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "android_dependency_pinning",
      label: "Dependencies are pinned to exact versions",
      status: dynamicVersions ? "WARN" : unread ? "INCONCLUSIVE" : "PASS",
      confidence: unread ? "LOW" : "HIGH",
      detail: dynamicVersions
        ? `A Gradle dependency uses a dynamic version (\`+\` or \`latest.release\`). Two builds of the same commit can ` +
          `then produce different apps, so a crash report cannot be tied to a dependency set — and a compromised ` +
          `release of that library is pulled into your next build with no diff to review and no approval step. Pin ` +
          `exact versions and use a lockfile or version catalog.`
        : unread
          ? `No dynamic Gradle version ranges in what was read, but ${ctx.catalogUnread ? "the version catalog (gradle/*.versions.toml) was not read" : `only ${Math.round(ctx.gradleCoverage * 100)}% of the build.gradle files were read`}, ` +
            `so whether every dependency is pinned is not established.`
          : `No dynamic Gradle version ranges — dependency versions are pinned.`,
    });
  }

  // minSdk that is very old carries platform-level weaknesses the app cannot fix.
  // The app's minSdk is often not in app/build.gradle at all — it is set by a
  // convention plugin (nowinandroid: KotlinAndroid.kt) or a constant. The first
  // match in the joined Gradle text read nowinandroid's BENCHMARK module (28)
  // instead. Prefer files that apply the application plugin; otherwise take the
  // lowest non-test value (the app can be no newer than the oldest it declares).
  const min = resolveSdkLevels(ctx.buildFiles, "minSdk", ctx.catalog);
  const minValues = min.app.length > 0 ? min.app : min.other;
  if (minValues.length > 0) {
    const level = Math.min(...minValues);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "android_min_sdk_floor",
      label: "Minimum SDK excludes unsupported Android versions",
      status: level >= 24 ? "PASS" : "WARN",
      confidence: "HIGH",
      detail: level >= 24
        ? `minSdk ${level} — the app does not run on Android versions that predate the modern security model.`
        : `minSdk ${level} supports Android versions that no longer receive security updates and that lack platform ` +
          `protections the app cannot supply for itself: TLS 1.2 by default (API 20+), cleartext blocked by default ` +
          `(API 28+), and scoped storage. Supporting them also means shipping compatibility code and testing devices ` +
          `almost nobody uses — Play's own distribution data will show the share, and it is usually under 1%.`,
      evidence: `minSdk ${level}`,
    });
  } else if (ctx.gradle) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "android_min_sdk_floor",
      label: "Minimum SDK excludes unsupported Android versions",
      status: "INCONCLUSIVE",
      confidence: "LOW",
      detail:
        `The app's minSdk could not be resolved from the build files and convention plugins that were read — it is ` +
        `set from an expression or a file outside the sample — so its floor is not established.`,
    });
  }

  // Firebase config committed. Deliberately NOT a failure — Google ships these
  // keys in every app binary and treats them as public identifiers. Same call as
  // the iOS family makes for GoogleService-Info.plist (§34.5).
  if (ctx.paths.some((p) => /(^|\/)google-services\.json$/i.test(p))) {
    checks.push({
      category: CATEGORIES.SECRETS_KEYS,
      checkKey: "android_firebase_config_committed",
      label: "Firebase configuration is restricted, not secret",
      status: "WARN",
      confidence: "HIGH",
      detail:
        `\`google-services.json\` is committed. This is expected and not a leak — Google ships these values inside ` +
        `every published app binary and treats them as public identifiers, so rotating the key achieves nothing. ` +
        `The action is to confirm in the Cloud console that the API key is restricted to your package name and ` +
        `signing-certificate fingerprint, and that Firestore/Storage security rules do not rely on the key being ` +
        `secret — that cannot be seen from the repository, which is why this is flagged for confirmation rather than ` +
        `scored as a failure.`,
    });
  }

  return checks;
}

// ── Security ────────────────────────────────────────────────────────────────
function securityChecks(ctx: AndroidContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];

  // Cleartext HTTP app-wide. The exact finding the Flutter family caught in the
  // same client's Android app — worth checking against the iOS side, where ATS is
  // usually enforced; the two drifting apart is the common case.
  const cleartext = /android:usesCleartextTraffic\s*=\s*"true"/i.test(ctx.manifest);
  const hasNetworkConfig = /android:networkSecurityConfig\s*=/i.test(ctx.manifest);
  // The network security config OVERRIDES the manifest flag, and its <base-config>
  // is the app-wide default — so `cleartextTrafficPermitted="true"` there is the same
  // finding as the manifest flag. It was never read: no flag + a permissive
  // base-config passed.
  const nscFiles = [...ctx.manifest.matchAll(/android:networkSecurityConfig\s*=\s*"@xml\/([\w.]+)"/gi)].map((m) => {
    const re = new RegExp(`(^|/)res/xml/${m[1].replace(/\./g, "\\.")}\\.xml$`);
    const hit = [...ctx.files].find(([path]) => re.test(path));
    return { name: m[1], text: hit?.[1] ?? null, exists: ctx.paths.some((path) => re.test(path)) };
  });
  const nscCleartext = nscFiles.some(
    (f) => f.text !== null && /<base-config\b[^>]*cleartextTrafficPermitted\s*=\s*"true"/i.test(f.text),
  );
  const nscUnread = nscFiles.some((f) => f.text === null && f.exists);
  const cleartextFound = cleartext || nscCleartext;
  const cleartextCheck: PulseScanCheckInput = {
    category: CATEGORIES.SECURITY,
    checkKey: "android_cleartext_traffic",
    label: "Cleartext HTTP disabled",
    status: cleartextFound ? "FAIL" : nscUnread ? "INCONCLUSIVE" : "PASS",
    confidence: nscUnread && !cleartextFound ? "LOW" : "HIGH",
    detail: cleartextFound
      ? `${cleartext ? '`android:usesCleartextTraffic="true"`' : 'The network security config\'s `<base-config cleartextTrafficPermitted="true">`'} ` +
        `permits plaintext HTTP app-wide, so any request can be downgraded and read on a hostile network. ${hasNetworkConfig
          ? "Scope the exception to the single host that needs it with a <domain-config>, and remove the app-wide setting."
          : "Remove it, or scope a single host with a networkSecurityConfig."}`
      : nscUnread
        ? `No app-wide cleartext flag in the manifest, but it references a network security config (${nscFiles.map((f) => `@xml/${f.name}`).join(", ")}) ` +
          `that was not read — and that file's base-config decides whether cleartext is permitted.`
        : `Cleartext HTTP is not enabled app-wide (API 28+ blocks it by default)${nscFiles.length > 0 ? ", and the network security config's base-config does not permit it" : ""}.`,
  };
  checks.push(cleartextFound ? cleartextCheck : manifestAbsence(ctx, cleartextCheck));

  // debuggable=true in a shipped manifest is a straightforward compromise: it lets
  // anyone attach a debugger to a release build on a normal device. Gradle's
  // `release { isDebuggable = true }` does exactly the same and was never checked.
  const debuggableManifest = /android:debuggable\s*=\s*"true"/i.test(ctx.manifest);
  const debuggableRelease = ctx.buildFiles.some((f) =>
    releaseBlocks(stripJvmFile(f.path, f.text)).some((b) => /\b(?:isDebuggable|debuggable)\b\s*=?\s*true\b/.test(b)),
  );
  const debuggable = debuggableManifest || debuggableRelease;
  const debuggableCheck: PulseScanCheckInput = {
    category: CATEGORIES.SECURITY,
    checkKey: "android_debuggable_release",
    label: "Release build is not debuggable",
    status: debuggable ? "FAIL" : "PASS",
    confidence: "HIGH",
    detail: debuggableManifest
      ? `\`android:debuggable="true"\` is set in the manifest. In a shipped build that lets anyone attach a debugger ` +
        `to the running app on an ordinary device and read memory, including tokens and keys. Remove it — Gradle sets ` +
        `it automatically for debug builds, so it never belongs in the manifest.`
      : debuggableRelease
        ? `The Gradle \`release\` build type sets \`debuggable\` to true, so the build users install accepts a debugger ` +
          `on an ordinary device — memory, including tokens and keys, can be read. Remove it from the release build type.`
        : `The manifest does not force debuggable and the release build type does not enable it — Gradle controls it per build type, which is correct.`,
  };
  checks.push(debuggable ? debuggableCheck : manifestAbsence(ctx, debuggableCheck));

  // Backup copies the app's private data (including any plaintext prefs) into the
  // user's cloud backup and device-to-device transfers; `adb backup` extraction
  // only applies to apps targeting below API 31.
  const allowBackup = /android:allowBackup\s*=\s*"true"/i.test(ctx.manifest);
  const explicitlyDisabled = /android:allowBackup\s*=\s*"false"/i.test(ctx.manifest);
  const backupRules = /android:(fullBackupContent|dataExtractionRules)\s*=/i.test(ctx.manifest);
  const backupCheck: PulseScanCheckInput = {
    category: CATEGORIES.SECURITY,
    checkKey: "android_backup_rules",
    label: "Backup excludes sensitive data",
    status: explicitlyDisabled || backupRules ? "PASS" : "WARN",
    confidence: explicitlyDisabled || backupRules ? "HIGH" : "MEDIUM",
    detail: explicitlyDisabled
      ? `Backup is disabled, so app-private files cannot be extracted through the backup channel.`
      : backupRules
        ? `Backup rules are declared — confirm they exclude the files holding tokens and any cached personal data.`
        : `No \`android:allowBackup="false"\` and no backup rules, so backup is ${allowBackup ? "explicitly on" : "on by default"}: ` +
          `app-private files — including SharedPreferences XML holding any tokens — are copied into the user's cloud ` +
          `backup and device-to-device transfers, and for apps targeting below API 31 can be extracted with \`adb backup\`. ` +
          `If the app stores credentials or tokens, disable backup or declare dataExtractionRules that exclude those files.`,
  };
  checks.push(explicitlyDisabled || backupRules ? backupCheck : manifestAbsence(ctx, backupCheck));

  // Exported components without a permission are reachable by any other app — but
  // many MUST be exported by contract: the launcher, a share target (SEND), a
  // document picker (GET_CONTENT), a media button receiver, a MediaBrowserService, an
  // app widget, a browsable link handler. Those were the only exported components in
  // NewPipe and most of thunderbird, which were warned anyway because the old rule
  // excluded only LAUNCHER and counted permissions across the whole manifest. Each
  // component is now judged on its own element, and the risky ones are named.
  const exportedTrue = (ctx.manifest.match(/android:exported\s*=\s*"true"/gi) ?? []).length;
  const risky = riskyExportedComponents(ctx.manifest);
  if (exportedTrue > 0) {
    const exportedCheck: PulseScanCheckInput = {
      category: CATEGORIES.SECURITY,
      checkKey: "android_exported_components",
      label: "Exported components are permission-guarded",
      status: risky.length > 0 ? "WARN" : "PASS",
      confidence: "MEDIUM",
      detail: risky.length === 0
        ? `${exportedTrue} exported component(s); each is either permission-guarded or exported because its job is to ` +
          `be invoked by other apps or the system (launcher, share target, document picker, media button, widget, ` +
          `browsable link) — those must be exported.`
        : `${risky.length} exported component(s) with no \`android:permission\` and no public-by-contract intent ` +
          `filter: ${risky.slice(0, 5).join(", ")}${risky.length > 5 ? ` and ${risky.length - 5} more` : ""}. An ` +
          `exported activity, service or receiver can be started by ANY other app on the device. Check each one, and ` +
          `set \`android:exported="false"\` or add a signature-level permission to those that must stay open.`,
      ...(risky.length > 0 ? { evidence: risky.slice(0, 5).join(", ") } : {}),
    };
    checks.push(risky.length > 0 ? exportedCheck : manifestAbsence(ctx, exportedCheck));
  }

  // Release logging. Whether a log call is gated is a judgement about the WHOLE
  // codebase: "no BuildConfig.DEBUG guard anywhere" is an absence finding and goes
  // through the coverage gate (thunderbird: 4% sampled, ≥10 unsampled files guard).
  const logCalls = (ctx.source.match(/\bLog\.[vdiwe]\s*\(|\bprintln\s*\(|\bTimber\.[vdiwe]\s*\(/g) ?? []).length;
  const hasBuildGuard = /BuildConfig\.DEBUG/.test(ctx.source);
  if (logCalls > 0) {
    checks.push(absence(ctx, {
      category: CATEGORIES.SECURITY,
      checkKey: "android_release_logging",
      label: "Logging is disabled in release builds",
      status: hasBuildGuard ? "PASS" : "WARN",
      detail: hasBuildGuard
        ? `${logCalls} log call(s) found, and BuildConfig.DEBUG guards are present — confirm the guard wraps the ` +
          `logger itself rather than a handful of call sites.`
        : `${logCalls} log call(s) and NO \`BuildConfig.DEBUG\` guard anywhere in the sampled source, so logging ` +
          `ships enabled. Android logs are readable by anyone with the device and adb, and are captured in bug ` +
          `reports users send to support. Gate the logger on BuildConfig.DEBUG, or strip logs with a ProGuard rule.`,
      evidence: hasBuildGuard
        ? `${logCalls} log call(s), BuildConfig.DEBUG guard present`
        : `${logCalls} log call(s), no BuildConfig.DEBUG`,
    }));
  }

  // WebView JavaScript bridge — addJavascriptInterface exposes native methods to
  // page JS, which is remote-code-execution territory when the page is not yours.
  if (/addJavascriptInterface\s*\(/.test(ctx.source)) {
    const loadsRemote = /loadUrl\s*\(\s*"https?:\/\//i.test(ctx.source);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "android_webview_js_bridge",
      label: "WebView JavaScript bridge is not exposed to remote content",
      status: loadsRemote ? "FAIL" : "WARN",
      confidence: "MEDIUM",
      detail: loadsRemote
        ? `\`addJavascriptInterface\` exposes native methods to page JavaScript, and the WebView also loads a remote ` +
          `URL. Any script on that page — including one injected by a compromised third party or an ad — can call ` +
          `into the app. Remove the bridge, or restrict the WebView to content you ship in the APK.`
        : `\`addJavascriptInterface\` exposes native methods to page JavaScript. Safe only while the WebView loads ` +
          `content you control; confirm it never loads a remote URL.`,
    });
  }

  return checks;
}

// ── Secrets & keys ──────────────────────────────────────────────────────────
/**
 * A password reaching preference storage — the WRITE, not the word.
 *
 * Matches the SharedPreferences/DataStore write APIs with a password-shaped key,
 * as either a literal or a `*_PASSWORD` constant. Those are the two ways it is
 * actually written; a string that merely mentions passwords is not one of them.
 *
 * Exported because this predicate is the whole check, and the difference between
 * a true finding and a 100% false-positive rate lives in it alone.
 */
export function tokenKeyInPrefsApi(source: string): boolean {
  return /\b(?:put|get)(?:String|StringSet)\s*\(\s*(?:"[^"\n]*(?:access|refresh|auth|bearer|id)[_-]?token[^"\n]*"|[A-Za-z0-9_]*TOKEN[A-Za-z0-9_]*)\s*[,)]/i
    .test(source);
}

export function writesPasswordToPrefs(source: string): boolean {
  return /\bput(?:String|Boolean|Int|Long|Float|StringSet)\s*\(\s*(?:"[^"\n]*password[^"\n]*"|[A-Za-z0-9_]*PASSWORD[A-Za-z0-9_]*)\s*,/i
    .test(source);
}

function secretsChecks(ctx: AndroidContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];

  // Tokens in SharedPreferences. The exact inversion found across this client's
  // iOS and Flutter apps: a secure store exists in the project and the tokens are
  // not in it.
  // ⚠️ Same co-occurrence defect as android_password_retention below, same fix.
  // The old rule was "a token-shaped identifier anywhere" AND "SharedPreferences
  // anywhere" — so any app with an `accessToken` variable and a settings screen
  // FAILED. Measured across the corpus it fired on 5 of 6 real Android apps. The
  // finding claims tokens are "read from or written to SharedPreferences", so it
  // has to match the preference API itself.
  const usesPrefs = /getSharedPreferences\s*\(|PreferenceManager\.|\bdataStore\b/i.test(ctx.source);
  const usesEncrypted = /EncryptedSharedPreferences|MasterKeys?\.|androidx\.security/i.test(ctx.source + ctx.gradle);
  const tokenNearPrefs = usesPrefs && tokenKeyInPrefsApi(ctx.source);

  if (tokenNearPrefs) {
    checks.push({
      category: CATEGORIES.SECRETS_KEYS,
      checkKey: "android_token_storage",
      label: "Auth tokens stored in encrypted storage",
      status: usesEncrypted ? "WARN" : "FAIL",
      confidence: usesEncrypted ? "MEDIUM" : "HIGH",
      detail: usesEncrypted
        ? `Auth token keys appear alongside SharedPreferences use, and EncryptedSharedPreferences is also present in ` +
          `this project. Confirm the TOKENS specifically go to the encrypted store — a half-finished migration, where ` +
          `the secure store exists but the tokens were never moved into it, is the common case.`
        : `Auth token keys are read from or written to SharedPreferences with no sign of EncryptedSharedPreferences ` +
          `anywhere. SharedPreferences is a plaintext XML file in app-private storage: readable on a rooted device, ` +
          `and extractable via ADB backup wherever backup is allowed. Move tokens to EncryptedSharedPreferences ` +
          `(androidx.security-crypto) or the Android Keystore.`,
    });
  }

  // A password persisted at all is worse than where it is persisted.
  //
  // ⚠️ This must match the WRITE, not the word. The rule was previously "a string
  // literal containing 'password'" AND "SharedPreferences used somewhere in the
  // sampled source" — co-occurrence in a concatenated blob, not a relationship.
  // Run across 7 real Android apps it reported a FAIL on ALL SEVEN, including
  // nextcloud/android, duckduckgo/Android and mozilla-mobile/reference-browser.
  // The actual matches were:
  //
  //     @property providerId ... ("google.com", "facebook.com", "password")   ← KDoc
  //     message?.contains("password", ignoreCase = true)                      ← error text
  //     message = "Create user with email and password was cancelled"         ← UI copy
  //     Timber.w(e, "Failed to save password credential for: %s", email)      ← a log line
  //
  // Not one is a password reaching storage. A 100% FAIL rate in SECRETS_KEYS —
  // a category every release-gate policy blocks on — is not seven security
  // incidents, it is a broken check. Requiring the preference-write API is what
  // makes the finding mean what it says; the key may be a literal or a
  // *_PASSWORD constant, which are the two ways it is actually written.
  if (writesPasswordToPrefs(ctx.source) && usesPrefs) {
    checks.push({
      category: CATEGORIES.SECRETS_KEYS,
      checkKey: "android_password_retention",
      label: "User password is not persisted on device",
      status: "FAIL",
      confidence: "MEDIUM",
      detail:
        `A password key appears to be written to on-device preference storage, typically for a "remember me" feature. ` +
        `Encrypted storage is the right place for secrets, but a password never needs to be retained at all: keep a ` +
        `refresh token and re-authenticate with that. Retaining it widens the blast radius of any device compromise ` +
        `to the user's actual credential, which is very often reused elsewhere.`,
    });
  }

  // API keys committed in Gradle or source rather than injected at build time.
  // ⚠️ A Google API key (`AIza…`) is a PUBLIC identifier that ships inside every
  // app using Google APIs; it is protected by restriction, not secrecy (same call as
  // google-services.json above). NewPipe's `GOOGLE_API_KEY = "AIzaSy…"` was a FAIL.
  // Any other long key-shaped literal (e.g. `sk_live_…`) still fails.
  const KEY_LITERAL = /(api_?key|apiKey|secret|clientSecret)\s*[=:]\s*"([A-Za-z0-9_\-]{16,})"/gi;
  const keyValues = (text: string) => [...text.matchAll(KEY_LITERAL)].map((m) => m[2]);
  const gradleKeys = keyValues(ctx.gradle);
  const sourceKeys = keyValues(ctx.source);
  const isGooglePublicKey = (v: string) => /^AIza[0-9A-Za-z_\-]{35}$/.test(v);
  const secretKeys = [...gradleKeys, ...sourceKeys].filter((v) => !isGooglePublicKey(v));
  if (gradleKeys.length + sourceKeys.length > 0) {
    const inGradle = secretKeys.length > 0 ? gradleKeys.some((v) => !isGooglePublicKey(v)) : gradleKeys.length > 0;
    checks.push({
      category: CATEGORIES.SECRETS_KEYS,
      checkKey: "android_hardcoded_api_key",
      label: "API keys are not hardcoded in the repo",
      status: secretKeys.length > 0 ? "FAIL" : "WARN",
      confidence: "MEDIUM",
      detail: secretKeys.length > 0
        ? `A long key-shaped literal is committed in ${inGradle ? "a Gradle build file" : "application source"}. Anything ` +
          `in the APK is readable — \`apktool\` takes seconds — so treat a committed key as public: rotate it, then inject ` +
          `it at build time from gradle.properties (git-ignored) or CI secrets, and restrict it by package name and ` +
          `signing certificate where the provider supports that.`
        : `A Google API key (\`AIza…\`) is committed in ${inGradle ? "a Gradle build file" : "application source"}. ` +
          `Google API keys are public identifiers that ship inside every app binary using them — protected by ` +
          `restriction, not secrecy — so this is not a leak and rotating it achieves nothing. Confirm in the Cloud ` +
          `console that the key is restricted to your package name and signing-certificate fingerprint and to the ` +
          `APIs the app actually calls; that cannot be seen from the repository.`,
    });
  }

  // Signing config with a literal password in Gradle: the key that IS the app.
  if (/storePassword\s*=?\s*"[^"]+"|keyPassword\s*=?\s*"[^"]+"/i.test(ctx.gradle)) {
    checks.push({
      category: CATEGORIES.SECRETS_KEYS,
      checkKey: "android_signing_credentials_committed",
      label: "Signing credentials are not committed",
      status: "FAIL",
      confidence: "HIGH",
      detail:
        `A signing store or key password is written literally into a Gradle build file. The upload/signing key is the ` +
        `one credential that cannot be rotated cheaply — whoever holds it can publish an update AS you. Move it to ` +
        `gradle.properties outside version control (or CI secrets), and if this was ever pushed to a shared remote, ` +
        `treat the key as compromised and start a Play upload-key reset.`,
    });
  }

  return checks;
}

// ── Store readiness ─────────────────────────────────────────────────────────
function storeReadinessChecks(ctx: AndroidContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];

  // targetSdk floor — Play REJECTS below it, so this blocks release outright.
  // Resolved like minSdk (convention plugins, constants, DSL block form). For a
  // multi-module app it was usually not in any build file the first-match read, and
  // the check was silently omitted — a store-blocking check must not vanish because
  // its value is set somewhere we did not resolve.
  const target = resolveSdkLevels(ctx.buildFiles, "targetSdk", ctx.catalog);
  const targetValues = target.app.length > 0 ? target.app : target.other;
  if (targetValues.length > 0) {
    const level = Math.min(...targetValues);
    checks.push({
      category: CATEGORIES.APP_STORE,
      checkKey: "android_target_sdk_current",
      label: "targetSdk meets the Play Store floor",
      status: level >= PLAY_TARGET_SDK_FLOOR ? "PASS" : "FAIL",
      confidence: "HIGH",
      detail: level >= PLAY_TARGET_SDK_FLOOR
        ? `targetSdk ${level} meets Google Play's current minimum (${PLAY_TARGET_SDK_FLOOR}).`
        : `targetSdk ${level} is below Google Play's minimum of ${PLAY_TARGET_SDK_FLOOR}. Play will REJECT new ` +
          `releases until it is raised — this blocks shipping, it is not a warning. Raising it also opts the app into ` +
          `newer platform behaviour (permissions, background limits), so budget testing rather than only bumping the number.`,
      evidence: `targetSdk ${level}`,
    });
  } else {
    checks.push({
      category: CATEGORIES.APP_STORE,
      checkKey: "android_target_sdk_current",
      label: "targetSdk meets the Play Store floor",
      status: "INCONCLUSIVE",
      confidence: "LOW",
      detail:
        `The app's targetSdk could not be resolved from the build files and convention plugins that were read, so ` +
        `whether it meets Google Play's minimum (${PLAY_TARGET_SDK_FLOOR}) is not established. Check the value the ` +
        `release build resolves — Play rejects uploads below the floor.`,
    });
  }

  // Dangerous permissions need a user-facing justification at review.
  const DANGEROUS = [
    ["ACCESS_FINE_LOCATION", "precise location"],
    ["ACCESS_BACKGROUND_LOCATION", "background location"],
    ["READ_CONTACTS", "contacts"],
    ["RECORD_AUDIO", "microphone"],
    ["READ_SMS", "SMS"],
    ["QUERY_ALL_PACKAGES", "the full installed-app list"],
    ["READ_EXTERNAL_STORAGE", "external storage"],
  ] as const;
  const requested = DANGEROUS.filter(([p]) => new RegExp(`android\\.permission\\.${p}\\b`).test(ctx.manifest));
  if (requested.length > 0) {
    checks.push({
      category: CATEGORIES.APP_STORE,
      checkKey: "android_sensitive_permissions",
      label: "Sensitive permissions are justified",
      status: "WARN",
      confidence: "HIGH",
      detail:
        `The manifest requests ${requested.map(([, label]) => label).join(", ")}. Each of these needs a declared ` +
        `purpose in the Play listing, and several (background location, SMS, QUERY_ALL_PACKAGES) require a separate ` +
        `Play declaration and are refused without a strong justification. Remove any the app does not actually use — ` +
        `an unused sensitive permission is a rejection risk for no benefit.`,
      evidence: requested.map(([p]) => p).join(", "),
    });
  }

  // Code shrinking / obfuscation off means the shipped APK is trivially readable.
  // gradleToggleState is shared with the extended family so the two always agree.
  const minify = gradleToggleState(ctx.gradle, "minify");
  // "Not configured" is an absence across build files; with some unread it is not established.
  const unreadUnset = minify === "unset" && (ctx.gradleCoverage < 1 || !ctx.gradle);
  checks.push({
    category: CATEGORIES.APP_STORE,
    checkKey: "android_minify_enabled",
    label: "Release build is minified and shrunk",
    status: minify === "on" ? "PASS" : minify === "computed" || unreadUnset ? "INCONCLUSIVE" : "WARN",
    confidence: minify === "computed" || unreadUnset ? "LOW" : minify === "unset" ? "MEDIUM" : "HIGH",
    detail: minify === "on"
      ? `R8/ProGuard shrinking is enabled for release.`
      : unreadUnset
        ? `No \`minifyEnabled\` setting in the build files that were read (${Math.round(ctx.gradleCoverage * 100)}% of ` +
          `this repo's build.gradle files), so whether R8 runs for release is not established.`
        : minify === "computed"
          ? `Release shrinking is set from a build-time expression (\`minifyEnabled\` / \`isMinifyEnabled = …\`) that cannot be evaluated ` +
            `from source, so whether R8 runs for release could not be confirmed — check the value your release build resolves.`
          : `Release shrinking (\`minifyEnabled true\`) is ${minify === "off" ? "explicitly disabled" : "not configured"}. ` +
            `Without it the APK ships larger than it needs to be and with original class and method names intact, so ` +
            `reading the app's logic — including how it talks to your API — is straightforward. Enable R8 for release.`,
  });

  return checks;
}

// ── Code quality ────────────────────────────────────────────────────────────
function qualityChecks(ctx: AndroidContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];

  // Test target. Android's convention is real directories, so absence is checkable
  // from the tree rather than a sample — no confidence downgrade needed.
  const testFiles = ctx.paths.filter(
    (p) => /(^|\/)src\/(test|androidTest)\//i.test(p) && /\.(kt|java)$/i.test(p) && !isVendoredPath(p),
  );
  const sourceCount = ctx.paths.filter((p) => /\.(kt|java)$/i.test(p) && !isVendoredPath(p)).length;
  checks.push({
    category: CATEGORIES.CODE_QUALITY,
    checkKey: "android_test_coverage",
    label: "Test suite proportionate to the codebase",
    status: testFiles.length === 0 ? "FAIL" : testFiles.length < Math.max(3, sourceCount * 0.02) ? "WARN" : "PASS",
    confidence: "HIGH",
    detail: testFiles.length === 0
      ? `No test sources under src/test or src/androidTest, against ${sourceCount} Kotlin/Java files — nothing ` +
        `verifies a change before it reaches the Play Store.`
      : `${testFiles.length} test file(s) against ${sourceCount} source files.`,
    evidence: `${testFiles.length} test / ${sourceCount} source`,
  });

  // Environment selected by editing source — the defect the Flutter family exists
  // for, in its Kotlin form. Presence-based: we can see the commented alternatives.
  const baseUrlDecl = /(?:const\s+val|val|static\s+final\s+String)\s+\w*BASE_?URL\w*\s*[:=]/i;
  if (baseUrlDecl.test(ctx.sourceRaw)) {
    const commentedAlternatives = (ctx.sourceRaw.match(/^\s*\/\/\s*(?:const\s+val|val)\s+\w*BASE_?URL/gim) ?? []).length;
    const NON_PROD = /(staging|\.test\.|test\.|dev\.|\.local|localhost|10\.0\.2\.2|ngrok|preprod|uat|sandbox)/i;
    const liveUrl = /(?:const\s+val|val)\s+\w*BASE_?URL\w*\s*[:=]\s*"([^"]+)"/i.exec(ctx.source)?.[1] ?? "";
    const liveIsNonProd = NON_PROD.test(liveUrl);

    if (commentedAlternatives > 0 || liveIsNonProd) {
      checks.push({
        category: CATEGORIES.SECURITY,
        checkKey: "android_env_baseurl",
        label: "API environment is not selected by editing source",
        status: liveIsNonProd ? "FAIL" : "WARN",
        confidence: "HIGH",
        detail: liveIsNonProd
          ? `The active API base URL is a NON-PRODUCTION host: \`${liveUrl}\`${commentedAlternatives > 0
              ? `, with ${commentedAlternatives} alternative(s) commented out beside it` : ""}. If a release was built ` +
            `from this state the app is talking to that environment. Select the environment with a build type or ` +
            `product flavour (buildConfigField) so it is a build input, not a code edit someone has to remember to undo.`
          : `The API base URL has ${commentedAlternatives} alternative(s) commented out beside it, so the environment ` +
            `is chosen by editing a source line. That makes every release depend on someone remembering to swap it ` +
            `back. Use buildConfigField per build type or product flavour instead.`,
        evidence: liveUrl || `${commentedAlternatives} commented alternatives`,
      });
    }
  }

  // Force-unwrap density, per 1,000 lines — a raw count grows with any codebase and
  // would fire on every large repo forever (the §34.5 lesson).
  if (ctx.lines >= MIN_LINES_FOR_DENSITY) {
    const bangs = (ctx.source.match(/!!/g) ?? []).length;
    const per1k = (bangs / ctx.lines) * 1000;
    checks.push({
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "android_force_unwrap_density",
      label: "Null assertions (!!) used sparingly",
      status: per1k > 8 ? "WARN" : "PASS",
      confidence: "HIGH",
      detail: per1k > 8
        ? `${bangs} \`!!\` null assertions across ${ctx.lines.toLocaleString()} sampled lines (${per1k.toFixed(1)} per ` +
          `1,000). Each one is a crash the compiler offered to prevent. Prefer \`?.\`, \`?:\` or an explicit ` +
          `requireNotNull with a message that says what was missing.`
        : `${per1k.toFixed(1)} \`!!\` assertions per 1,000 sampled lines — within normal range.`,
      evidence: `${bangs} in ${ctx.lines.toLocaleString()} lines`,
    });
  }

  // Absence findings — these self-downgrade on a thin sample.
  // `contentDescription = null` is Compose's explicit "decorative, announce nothing" — it is
  // required on every Icon/Image, so it appears in apps that describe nothing at all and must
  // not count as a description being set.
  const describedCount =
    (ctx.source.match(/contentDescription/gi) ?? []).length -
    (ctx.source.match(/contentDescription\s*=\s*null\b|setContentDescription\s*\(\s*null\s*\)/gi) ?? []).length;
  const described = describedCount > 0 || /semantics\s*\{/.test(ctx.source);
  checks.push(absence(ctx, {
    category: CATEGORIES.ACCESSIBILITY,
    checkKey: "android_content_descriptions",
    label: "Interactive elements have content descriptions",
    status: described ? "PASS" : "WARN",
    detail: described
      ? `Content descriptions are set, so TalkBack has something to announce.`
      : `No contentDescription or Compose semantics found. Every non-text control is then announced by TalkBack as ` +
        `"button" with no indication of what it does, which makes the app unusable with a screen reader and is a ` +
        `common accessibility-complaint trigger.`,
  }));

  // Room DAOs are a local store. In an offline-first app (nowinandroid) screens render from the
  // device, so "every screen re-fetches" is false — but many apps keep only favourites/history in
  // Room and fetch everything else live, so a DAO is not proof of response caching either. It makes
  // the HTTP-cache absence inconclusive (LOW, unscored), never a PASS.
  const httpCache = /\bCache\s*\(|cacheControl|OkHttpClient[\s\S]{0,200}\.cache\s*\(/i.test(ctx.source);
  const localStore = /@Dao\b/.test(ctx.source) ||
    ctx.paths.some((p) => /(^|\/)[^/]*Dao\.(kt|java)$/.test(p) && !isVendoredPath(p));
  if (!httpCache && localStore) {
    checks.push({
      category: CATEGORIES.PERFORMANCE,
      checkKey: "android_http_cache",
      label: "HTTP responses are cached",
      status: "WARN",
      confidence: "LOW",
      detail:
        `No OkHttp cache or Cache-Control handling found, but the app persists data locally in a Room database ` +
        `(DAOs found). If screens render from that store and sync in the background (offline-first), responses are ` +
        `effectively cached; if Room holds only a few tables, everything else is still re-fetched on every visit. ` +
        `This is inconclusive from source alone.`,
    });
  } else {
    checks.push(absence(ctx, {
      category: CATEGORIES.PERFORMANCE,
      checkKey: "android_http_cache",
      label: "HTTP responses are cached",
      status: httpCache ? "PASS" : "WARN",
      detail: httpCache
        ? `An HTTP cache is configured on the client.`
        : `No OkHttp cache or Cache-Control handling found, so every screen re-fetches over the network. On a weak or ` +
          `metered connection that is felt directly as slowness, and it burns the user's data allowance re-downloading ` +
          `content the device already had.`,
    }));
  }

  // NetworkType.CONNECTED accepts cellular, so it is NOT a metered gate — only UNMETERED is, wherever it
  // appears (a conditional `if (wifiOnly) NetworkType.UNMETERED else …` is a real, user-configurable gate).
  // Static-import forms and DownloadManager's Wi-Fi-only / setAllowedOverMetered(false) are real gates too.
  const meteredGate =
    /isActiveNetworkMetered|NET_CAPABILITY_NOT_METERED|NetworkType\.UNMETERED\b|NETWORK_TYPE_UNMETERED\b|setRequiredNetworkType\s*\(\s*UNMETERED\b|setAllowedOverMetered\s*\(\s*false|setAllowedNetworkTypes\s*\(\s*(?:DownloadManager\.)?(?:Request\.)?NETWORK_WIFI\s*\)/i.test(
      ctx.source,
    );
  checks.push(absence(ctx, {
    category: CATEGORIES.PERFORMANCE,
    checkKey: "android_metered_network",
    label: "Large transfers respect metered connections",
    status: meteredGate
      ? "PASS" : "WARN",
    detail: meteredGate
      ? `Metered-connection checks are present before large transfers.`
      : `No metered-network check found. Downloads and media prefetch then run identically on Wi-Fi and on cellular, ` +
        `which is what turns into "the app used all my data". Gate large transfers on ` +
        `ConnectivityManager.isActiveNetworkMetered, or a WorkManager constraint.`,
  }));

  return checks;
}
