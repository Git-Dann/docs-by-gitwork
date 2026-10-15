import { describe, it, expect } from "vitest";
import { evaluateAndroidChecks } from "../android-app";
import { evaluateAndroidExtendedChecks, concatenatedSql } from "../android-app-extended";
import { evaluateCliChecks } from "../cli-tool";
import type { RepoSnapshot } from "../native-mobile";

// Adversarial review of the r-android group's fixes. Each case is two-sided: the input
// the fix is about must change, a representative correct input must not.

function snapshot(files: Record<string, string>): RepoSnapshot {
  return {
    owner: "acme",
    repo: "app",
    paths: Object.keys(files),
    files: new Map(Object.entries(files)),
    truncated: false,
    accessible: true,
  };
}
type C = { checkKey: string; status: string; confidence?: string };
const find = (checks: C[], k: string) => checks.find((c) => c.checkKey === k);
const M = "app/src/main/AndroidManifest.xml";
const MANIFEST = `<manifest><application android:allowBackup="false"></application></manifest>`;

function base(gradle: string, source: string): RepoSnapshot {
  return snapshot({
    [M]: MANIFEST,
    "app/build.gradle": gradle,
    "app/src/main/java/com/acme/Main.kt": source,
  });
}

describe("minify: Groovy assignment syntax counts as configured", () => {
  const on = `android { buildTypes { release { minifyEnabled = true } } }`;
  const off = `android { buildTypes { release { minifyEnabled = false } } }`;

  it("`minifyEnabled = true` passes both minify checks", () => {
    const core = evaluateAndroidChecks(base(on, "class Main"));
    expect(find(core, "android_minify_enabled")?.status).toBe("PASS");
    const ext = evaluateAndroidExtendedChecks(base(on, "class Main"));
    expect(find(ext, "android_x_code_shrinking")?.status).toBe("PASS");
  });

  it("`minifyEnabled = false` still warns, at HIGH, as explicitly disabled", () => {
    const c = find(evaluateAndroidChecks(base(off, "class Main")), "android_minify_enabled");
    expect(c?.status).toBe("WARN");
    expect(c?.confidence).toBe("HIGH");
    expect(find(evaluateAndroidExtendedChecks(base(off, "class Main")), "android_x_code_shrinking")?.status).toBe("WARN");
  });
});

describe("metered network: JobScheduler's NETWORK_TYPE_UNMETERED is a gate", () => {
  it("passes on JobInfo.NETWORK_TYPE_UNMETERED", () => {
    const src = `val job = JobInfo.Builder(1, cn).setRequiredNetworkType(JobInfo.NETWORK_TYPE_UNMETERED).build()`;
    expect(find(evaluateAndroidChecks(base("", src)), "android_metered_network")?.status).toBe("PASS");
  });
  it("does not pass on NETWORK_TYPE_ANY", () => {
    const src = `val job = JobInfo.Builder(1, cn).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).build()`;
    expect(find(evaluateAndroidChecks(base("", src)), "android_metered_network")?.status).toBe("WARN");
  });
});

describe("content descriptions: `contentDescription = null` is not a description", () => {
  it("an app whose only occurrences are `= null` does not pass", () => {
    const src = `Icon(Icons.Default.Add, contentDescription = null)\nImage(painter, contentDescription = null)`;
    expect(find(evaluateAndroidChecks(base("", src)), "android_content_descriptions")?.status).toBe("WARN");
  });
  it("a real description still passes", () => {
    const src = `Icon(Icons.Default.Add, contentDescription = null)\nIcon(Icons.Default.Close, contentDescription = stringResource(R.string.close))`;
    expect(find(evaluateAndroidChecks(base("", src)), "android_content_descriptions")?.status).toBe("PASS");
  });
});

describe("concatenatedSql: Kotlin raw strings are judged too", () => {
  it("flags a template inside a multi-line raw string", () => {
    const src = 'db.rawQuery("""\n  SELECT * FROM users\n  WHERE name = \'$name\'\n""", null)';
    expect(concatenatedSql(src)).toBe(true);
  });
  it("does not flag a parameterised raw string with a constant table", () => {
    const src = 'db.rawQuery("""\n  SELECT * FROM $TABLE_USERS\n  WHERE name = ?\n""", arrayOf(name))';
    expect(concatenatedSql(src)).toBe(false);
  });
});

describe("cli_error_handling: module-scope try/catch scan", () => {
  const PKG = JSON.stringify({ name: "tool", bin: "./cli.js", license: "MIT" });
  const run = (impl: string) =>
    find(evaluateCliChecks(snapshot({ "package.json": PKG, "cli.js": impl })), "cli_error_handling")?.status;

  it("a try { await } finally {} cannot borrow a later, unrelated } catch", () => {
    const impl = `#!/usr/bin/env node\ntry {\n  await main();\n} finally {\n  done();\n}\nfunction f() {\n}\ncatch_all();\n`;
    expect(run(impl)).toBe("WARN");
  });
  it("a module-scope try { await } catch passes", () => {
    const impl = `#!/usr/bin/env node\ntry {\n  await main();\n} catch (error) {\n  console.error(error.message);\n  process.exit(1);\n}\n`;
    expect(run(impl)).toBe("PASS");
  });
  it("stays fast on a very long try body with no catch", () => {
    const impl = "#!/usr/bin/env node\ntry {\n" + "  await step();\n".repeat(30000) + "}\n";
    const t = Date.now();
    expect(run(impl)).toBe("WARN");
    expect(Date.now() - t).toBeLessThan(1000);
  });
});
