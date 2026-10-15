import { describe, it, expect } from "vitest";
import { evaluateCliChecks } from "../cli-tool";
import type { RepoSnapshot } from "../native-mobile";

function snapshot(files: Record<string, string>, extraPaths: string[] = []): RepoSnapshot {
  return {
    owner: "sindresorhus",
    repo: "np",
    paths: [...Object.keys(files), ...extraPaths],
    files: new Map(Object.entries(files)),
    truncated: false,
    accessible: true,
  };
}
const find = (checks: { checkKey: string }[], key: string) =>
  checks.find((c) => c.checkKey === key) as { status: string; detail?: string } | undefined;

const PKG = JSON.stringify({
  name: "np",
  description: "A better `npm publish`",
  license: "MIT",
  repository: "sindresorhus/np",
  type: "module",
  bin: "./source/cli.js",
  engines: { node: ">=22" },
  files: ["source"],
  dependencies: { meow: "^14.1.0", "exit-hook": "^5.1.0", chalk: "^5.6.2" },
});

const CLI = `#!/usr/bin/env node
import importLocal from 'import-local';
if (!importLocal(import.meta.url)) {
	await import('./cli-implementation.js');
}
`;

// Shape of np's source/cli-implementation.js (module-scope try around top-level await).
const NP_IMPL = `import logSymbols from 'log-symbols';
import {gracefulExit} from 'exit-hook';

try {
	const {options} = await getOptions();
	const newPackage = await np(options.version.toString(), options);
	console.log(\` \${newPackage.name} published\`);
} catch (error) {
	if (error.name === 'ExitPromptError') {
		process.exit(0);
	}

	console.error(\`\\n\${logSymbols.error} \${error?.stack ?? error}\`);
	gracefulExit(1);
}
`;

// A CLI whose only try/catch is inside a helper, and which never exits non-zero.
const BARE_IMPL = `import {gracefulExit} from 'exit-hook';
function readConfig() {
	try {
		return JSON.parse(fs.readFileSync('x.json', 'utf8'));
	} catch {
		return {};
	}
}
const options = await getOptions(readConfig());
await run(options);
gracefulExit(0);
process.exit(0);
`;

describe("audit repo-cli-tool-1 — cli_error_handling", () => {
  it("recognises a module-scope try/catch around top-level await (np)", () => {
    const checks = evaluateCliChecks(snapshot({
      "package.json": PKG,
      "source/cli.js": CLI,
      "source/cli-implementation.js": NP_IMPL,
    }));
    expect(find(checks, "cli_error_handling")?.status).toBe("PASS");
  });

  it("still warns when the only try/catch is indented inside a function", () => {
    const checks = evaluateCliChecks(snapshot({
      "package.json": PKG,
      "source/cli.js": CLI,
      "source/cli-implementation.js": BARE_IMPL,
    }));
    expect(find(checks, "cli_error_handling")?.status).toBe("WARN");
  });
  it("does not count a module-scope optional-require probe as entry-point error handling", () => {
    const PROBE = `let fsevents;
try {
  fsevents = require("fsevents");
} catch {}
main();
`;
    const checks = evaluateCliChecks(snapshot({
      "package.json": PKG,
      "source/cli.js": CLI,
      "source/cli-implementation.js": PROBE,
    }));
    expect(find(checks, "cli_error_handling")?.status).toBe("WARN");
  });
});

describe("audit repo-cli-tool-1 — cli_exit_codes", () => {
  it("treats exit-hook gracefulExit(1) as a non-zero exit (np)", () => {
    const checks = evaluateCliChecks(snapshot({
      "package.json": PKG,
      "source/cli.js": CLI,
      "source/cli-implementation.js": NP_IMPL,
    }));
    expect(find(checks, "cli_exit_codes")?.status).toBe("PASS");
  });

  it("still warns when every exit is exit code 0", () => {
    const checks = evaluateCliChecks(snapshot({
      "package.json": PKG,
      "source/cli.js": CLI,
      "source/cli-implementation.js": BARE_IMPL,
    }));
    expect(find(checks, "cli_exit_codes")?.status).toBe("WARN");
  });
  it("treats an oclif-style this.exit(2) as a non-zero exit", () => {
    const OCLIF = `export default class Run extends Command {
  async run() {
    const ok = await doWork();
    if (!ok) this.exit(2);
  }
}
`;
    const checks = evaluateCliChecks(snapshot({
      "package.json": PKG,
      "source/cli.js": CLI,
      "source/cli-implementation.js": OCLIF,
    }));
    expect(find(checks, "cli_exit_codes")?.status).toBe("PASS");
  });
});

describe("audit repo-cli-tool-1 — cli_lockfile_committed", () => {
  it("warns without a lockfile but does not claim the lockfile pins what is published", () => {
    const checks = evaluateCliChecks(snapshot({
      "package.json": PKG,
      "source/cli.js": CLI,
    }, [".npmrc"]));
    const c = find(checks, "cli_lockfile_committed");
    expect(c?.status).toBe("WARN");
    expect(c?.detail).not.toMatch(/not necessarily the code you publish/i);
    expect(c?.detail).toMatch(/does not pin what your users install/i);
  });

  it("still passes when package-lock.json is committed", () => {
    const checks = evaluateCliChecks(snapshot({
      "package.json": PKG,
      "source/cli.js": CLI,
    }, ["package-lock.json"]));
    expect(find(checks, "cli_lockfile_committed")?.status).toBe("PASS");
  });

  it("treats a committed npm-shrinkwrap.json as a lockfile", () => {
    const checks = evaluateCliChecks(snapshot({
      "package.json": PKG,
      "source/cli.js": CLI,
    }, ["npm-shrinkwrap.json"]));
    expect(find(checks, "cli_lockfile_committed")?.status).toBe("PASS");
  });
});
