import { describe, expect, it } from "vitest";
import { EXTENSION_LANGUAGE } from "../languages";
import { analyseStructure, buildImportConfig, extractImports, parseJsonc, resolveImports, stronglyConnected } from "../structure";
import type { CodeLanguage, FileMeasure } from "@/types/code-health";

/**
 * Fixtures are small but realistic repositories: the config files a real project carries
 * (tsconfig with comments and trailing commas, go.mod, composer.json, pubspec.yaml) and
 * the import idioms each language actually uses. Each runs the whole pipeline: config,
 * extraction, resolution, graph.
 */

const langOf = (p: string): CodeLanguage | null => EXTENSION_LANGUAGE[p.slice(p.lastIndexOf(".")).toLowerCase()] ?? null;
const isTestPath = (p: string) => /(^|\/)(__tests__|tests?)\/|[._-](test|spec)\.\w+$|_test\.go$/.test(p);

function fm(path: string, complexity = 1, isTest = isTestPath(path)): FileMeasure {
  const language = langOf(path) ?? "typescript";
  return { path, language, loc: 10, isTest, parseErrors: false, classes: [], functions: [{ name: "f", owner: null, startLine: 1, endLine: 2, loc: 2, complexity, params: 0, maxNesting: 0 }] };
}

function run(repo: Record<string, string>, complexity: Record<string, number> = {}) {
  const files = Object.keys(repo);
  const config = buildImportConfig((p) => repo[p] ?? null, files);
  const imports = new Map<string, string[]>();
  const languageOf = new Map<string, CodeLanguage>();
  const measured: FileMeasure[] = [];
  for (const f of files) {
    const l = langOf(f);
    if (!l) continue;
    languageOf.set(f, l);
    imports.set(f, extractImports(f, l, repo[f]));
    measured.push(fm(f, complexity[f] ?? 1));
  }
  const resolved = resolveImports({ files, imports, languageOf, config });
  return { config, resolved, report: analyseStructure(measured, resolved), edges: (f: string) => [...(resolved.edges.get(f) ?? [])].sort() };
}

describe("extractImports", () => {
  it("reads only module-level Python imports: a function-level or TYPE_CHECKING import is a deliberate cycle break", () => {
    const src = [
      "from typing import TYPE_CHECKING",
      "from httpie.compat import is_frozen",
      "if TYPE_CHECKING:",
      "    from httpie.sessions import Session",
      "def main():",
      "    from httpie.core import main",
      "    import httpie.status",
    ].join("\n");
    expect(extractImports("httpie/x.py", "python", src)).toEqual(["typing:TYPE_CHECKING", "httpie.compat:is_frozen"]);
  });


  it("leaves out type-only imports, which TypeScript erases, but keeps mixed ones", () => {
    const src = [
      'import type { Props } from "./types";',
      'import type * as core from "./core.js";',
      'import type Default from "./default";',
      'export type { Shape } from "./shape";',
      'export type * from "./all-types";',
      'import { type A, makeB } from "./mixed";',
      'import type from "./named-type";',
      'import { value } from "./value";',
    ].join("\n");
    expect(extractImports("src/a.ts", "typescript", src)).toEqual(["./mixed", "./named-type", "./value"]);
  });


  it("reads every TS/JS import form, in order, de-duplicated", () => {
    const src = `
import React, { useState } from "react";
import type { Props } from "./types";
import * as utils from '../lib/utils';
import "./polyfills";
export { a, b } from "./ab";
export * from "./all";
export type { T } from "./t";
const x = require("./legacy");
const lazy = await import("./lazy");
import fs = require("node:fs");
import React2 from "react";
`;
    expect(extractImports("src/a.ts", "typescript", src)).toEqual([
      // ./types and ./t are type-only: erased by TypeScript, so not runtime dependencies.
      "react", "../lib/utils", "./polyfills", "./ab", "./all", "./legacy", "./lazy", "node:fs",
    ]);
  });

  it("ignores a commented-out import and one inside a string literal", () => {
    const src = `
// import { old } from "./old";
/* import "./blocked";
   import x from "./also-blocked"; */
const doc = "import y from './in-a-string'";
const tpl = \`export * from "./in-a-template"\`;
const url = "https://example.com/x"; import real from "./real"; // trailing
`;
    expect(extractImports("a.ts", "typescript", src)).toEqual(["./real"]);
  });

  it("does not treat a member called import or require as one", () => {
    expect(extractImports("a.js", "javascript", `loader.import("./x"); obj.require("./y");`)).toEqual([]);
  });

  it("reads Python imports, keeping leading dots and expanding from-imports", () => {
    const src = `
"""Module docstring mentioning: import fake_module"""
import os, sys
import app.models.user as user_model
from . import helpers
from ..core import config, settings as s
from app.services import (
    billing,
    email,
)
from app.util import *
# import commented_out
`;
    expect(extractImports("app/api/views.py", "python", src)).toEqual([
      "os", "sys", "app.models.user", ".:helpers", "..core:config", "..core:settings", "app.services:billing", "app.services:email", "app.util",
    ]);
  });

  it("reads Go single and grouped imports", () => {
    const src = `package api
import "fmt"
import (
  "net/http"
  db "example.com/shop/internal/db"
  _ "example.com/shop/internal/migrations" // side effects
  // "example.com/shop/internal/old"
)
var s = \`import "example.com/shop/fake"\``;
    expect(extractImports("api/h.go", "go", src)).toEqual(["fmt", "net/http", "example.com/shop/internal/db", "example.com/shop/internal/migrations"]);
  });

  it("reads Java and Kotlin imports, including static and wildcard", () => {
    const java = `package com.acme.app;
import java.util.List;
import com.acme.core.Order;
import com.acme.core.model.*;
import static com.acme.core.Util.format;
import static com.acme.core.Strings.*;
`;
    expect(extractImports("A.java", "java", java)).toEqual(["java.util.List", "com.acme.core.Order", "com.acme.core.model.*", "com.acme.core.Util", "com.acme.core.Strings"]);
    expect(extractImports("A.kt", "kotlin", "import com.acme.core.Order\nimport com.acme.ui.Screen as S\n")).toEqual(["com.acme.core.Order", "com.acme.ui.Screen"]);
  });

  it("reads PHP use (including grouped) and require", () => {
    const src = `<?php
namespace App\\Http;
use App\\Models\\User;
use App\\Services\\{Billing, Mail as Mailer, Sub\\Report};
use function App\\helpers\\format;
#[Route("/x")]
require_once __DIR__ . '/bootstrap.php';
include 'config/app.php';
# use App\\Commented;
`;
    expect(extractImports("src/Http/C.php", "php", src)).toEqual([
      "App\\Models\\User", "App\\Services\\Billing", "App\\Services\\Mail", "App\\Services\\Sub\\Report", "App\\helpers\\format", "./bootstrap.php", "config/app.php",
    ]);
  });

  it("reads Dart import, export and part, but not part of", () => {
    const src = `import 'dart:async';
import 'package:shop/models/order.dart';
import '../widgets/button.dart' as btn;
export 'src/api.dart';
part 'cart.g.dart';
part of 'library.dart';
// import 'package:shop/old.dart';
`;
    expect(extractImports("lib/screens/cart.dart", "dart", src)).toEqual(["dart:async", "package:shop/models/order.dart", "../widgets/button.dart", "src/api.dart", "cart.g.dart"]);
  });

  it("reads Ruby require_relative and require", () => {
    const src = `require 'json'
require_relative 'helpers/format'
require_relative "../lib/billing"
=begin
require_relative 'commented'
=end
`;
    expect(extractImports("app/x.rb", "ruby", src)).toEqual(["json", "./helpers/format", "../lib/billing"]);
  });

  it("returns nothing for Swift, whose imports name modules not files", () => {
    expect(extractImports("App/View.swift", "swift", "import UIKit\nimport Feature\n")).toEqual([]);
  });
});

describe("parseJsonc", () => {
  it("reads tsconfig-style JSON with comments, trailing commas and // inside strings", () => {
    expect(parseJsonc(`{ // c\n "a": "https://x/y", /* b */ "b": [1, 2,], }`)).toEqual({ a: "https://x/y", b: [1, 2] });
  });
});

describe("resolveImports: TypeScript", () => {
  const repo = {
    "tsconfig.json": `{
      // Next.js default
      "compilerOptions": {
        "moduleResolution": "NodeNext",
        "paths": { "@/*": ["./src/*"], },
      },
    }`,
    "src/app/page.tsx": `import { Button } from "@/components/button";\nimport { db } from "@/lib";\nimport { fmt } from "../lib/format.js";\nimport React from "react";\nimport { gone } from "@/lib/missing";\nimport "./page.css";`,
    "src/components/button.tsx": `import { cn } from "@/lib/cn";`,
    "src/lib/index.ts": `export * from "./cn";`,
    "src/lib/cn.ts": ``,
    "src/lib/format.ts": ``,
    "src/app/page.css": ``,
  };

  it("follows the @/ alias, index files and a .js specifier that names a .ts source", () => {
    const { edges } = run(repo);
    expect(edges("src/app/page.tsx")).toEqual(["src/app/page.css", "src/components/button.tsx", "src/lib/format.ts", "src/lib/index.ts"]);
    expect(edges("src/components/button.tsx")).toEqual(["src/lib/cn.ts"]);
    expect(edges("src/lib/index.ts")).toEqual(["src/lib/cn.ts"]);
  });

  it("counts an internal miss as unresolved, and a package as neither", () => {
    const { resolved, report } = run(repo);
    // page: 5 internal (@/components, @/lib, ../lib/format.js, @/lib/missing, ./page.css), button 1, index 1.
    expect(resolved.internalTried).toBe(7);
    expect(resolved.unresolved).toBe(1);
    expect(report?.unresolvedShare).toBe(0.143);
    // The stylesheet resolved but is not a measured source file, so it is not a graph edge.
    expect(report?.edges).toBe(5);
    expect(report?.languages).toEqual(["tsx", "typescript"]);
  });

  it("uses a sibling tsconfig.app.json when tsconfig.json is only a solution file", () => {
    const { edges } = run({
      "tsconfig.json": `{ "files": [], "references": [{ "path": "./tsconfig.app.json" }] }`,
      "tsconfig.app.json": `{ "extends": "./tsconfig.base", "compilerOptions": { "paths": { "~app/*": ["src/*"] } } }`,
      "tsconfig.base.json": `{ "compilerOptions": { "baseUrl": "." } }`,
      "src/main.ts": `import { a } from "~app/a"; import { b } from "src/b";`,
      "src/a.ts": ``,
      "src/b.ts": ``,
    });
    expect(edges("src/main.ts")).toEqual(["src/a.ts", "src/b.ts"]);
  });
});

describe("resolveImports: other languages", () => {
  it("Python: relative, absolute and from-imports resolve; the standard library is not unresolved", () => {
    const { edges, resolved } = run({
      "app/__init__.py": "",
      "app/api/__init__.py": "from .views import router",
      "app/api/views.py": "import os\nimport requests\nfrom . import helpers\nfrom ..core import config\nfrom app.services import billing\nfrom app.models.user import User\nimport app.missing",
      "app/api/helpers.py": "",
      "app/core/__init__.py": "",
      "app/core/config.py": "",
      "app/services/__init__.py": "",
      "app/services/billing.py": "",
      "app/models/user.py": "",
    });
    expect(edges("app/api/views.py")).toEqual(["app/api/helpers.py", "app/core/config.py", "app/models/user.py", "app/services/billing.py"]);
    expect(edges("app/api/__init__.py")).toEqual(["app/api/views.py"]);
    // os and requests are external; app.missing looked internal (app is ours) and missed.
    expect(resolved.unresolved).toBe(1);
  });

  it("Python: a src/ layout resolves absolute imports", () => {
    const { edges } = run({ "src/shop/__init__.py": "", "src/shop/cart.py": "from shop.pricing import total", "src/shop/pricing.py": "" });
    expect(edges("src/shop/cart.py")).toEqual(["src/shop/pricing.py"]);
  });

  it("Go: an import of an own package fans out to every non-test file in it", () => {
    const { edges, resolved } = run({
      "go.mod": "module example.com/shop\n\ngo 1.22\n",
      "cmd/server/main.go": `package main\nimport (\n "fmt"\n "example.com/shop/internal/db"\n "example.com/shop/internal/nope"\n)`,
      "internal/db/conn.go": "package db",
      "internal/db/query.go": "package db",
      "internal/db/query_test.go": "package db",
    });
    expect(edges("cmd/server/main.go")).toEqual(["internal/db/conn.go", "internal/db/query.go"]);
    expect(resolved.unresolved).toBe(1);
  });

  it("Java: a class import, a nested class and a wildcard package import", () => {
    const { edges, resolved } = run({
      "src/main/java/com/acme/app/App.java": "package com.acme.app;\nimport com.acme.core.Order;\nimport com.acme.core.Order.Line;\nimport com.acme.core.model.*;\nimport com.acme.core.Gone;\nimport java.util.List;",
      "src/main/java/com/acme/core/Order.java": "package com.acme.core;",
      "src/main/java/com/acme/core/model/Item.java": "package com.acme.core.model;",
      "src/main/java/com/acme/core/model/Price.kt": "package com.acme.core.model",
    });
    expect(edges("src/main/java/com/acme/app/App.java")).toEqual([
      "src/main/java/com/acme/core/Order.java", "src/main/java/com/acme/core/model/Item.java", "src/main/java/com/acme/core/model/Price.kt",
    ]);
    // com.acme.core.Gone is in our package space and missing; java.util is external.
    expect(resolved.unresolved).toBe(1);
  });

  it("PHP: PSR-4 from composer.json, and a __DIR__-relative require", () => {
    const { edges } = run({
      "composer.json": `{ "autoload": { "psr-4": { "App\\\\": "src/" } }, "autoload-dev": { "psr-4": { "Tests\\\\": "tests/" } } }`,
      "src/Http/Controller.php": "<?php\nuse App\\Models\\User;\nuse App\\Services\\{Billing};\nuse Illuminate\\Support\\Str;\nrequire_once __DIR__ . '/routes.php';",
      "src/Http/routes.php": "<?php",
      "src/Models/User.php": "<?php",
      "src/Services/Billing.php": "<?php",
    });
    expect(edges("src/Http/Controller.php")).toEqual(["src/Http/routes.php", "src/Models/User.php", "src/Services/Billing.php"]);
  });

  it("Dart: a package self-import maps to lib/, other packages are external", () => {
    const { edges, resolved } = run({
      "pubspec.yaml": "name: shop\ndependencies:\n  http: ^1.0.0\n",
      "lib/main.dart": "import 'package:shop/screens/cart.dart';\nimport 'package:http/http.dart';\nimport 'dart:io';",
      "lib/screens/cart.dart": "import '../models/order.dart';",
      "lib/models/order.dart": "",
    });
    expect(edges("lib/main.dart")).toEqual(["lib/screens/cart.dart"]);
    expect(edges("lib/screens/cart.dart")).toEqual(["lib/models/order.dart"]);
    expect(resolved.unresolved).toBe(0);
  });

  it("Ruby: require_relative from the file's directory", () => {
    const { edges } = run({ "app/x.rb": "require 'json'\nrequire_relative 'helpers/fmt'", "app/helpers/fmt.rb": "" });
    expect(edges("app/x.rb")).toEqual(["app/helpers/fmt.rb"]);
  });
});

describe("analyseStructure", () => {
  it("finds a 3-file and a 2-file cycle, each with a real loop", () => {
    const { report } = run({
      "src/a.ts": `import "./b";`,
      "src/b.ts": `import "./c";`,
      "src/c.ts": `import "./a"; import "./leaf";`,
      "src/x.ts": `import "./y";`,
      "src/y.ts": `import "./x";`,
      "src/leaf.ts": ``,
    });
    expect(report?.cycleCount).toBe(2);
    expect(report?.filesInCycles).toBe(5);
    expect(report?.cycles.map((c) => c.files)).toEqual([["src/a.ts", "src/b.ts", "src/c.ts"], ["src/x.ts", "src/y.ts"]]);
    expect(report?.cycles[0].path).toEqual(["src/a.ts", "src/b.ts", "src/c.ts", "src/a.ts"]);
    expect(report?.cycles[1].path).toEqual(["src/x.ts", "src/y.ts", "src/x.ts"]);
    // Every step of every reported loop is a real import.
    const { edges } = run({ "src/a.ts": `import "./b";`, "src/b.ts": `import "./c";`, "src/c.ts": `import "./a";` });
    const p = report!.cycles[0].path;
    for (let i = 0; i + 1 < p.length; i++) expect(edges(p[i])).toContain(p[i + 1]);
    // The cycle collapses to one node for depth: {a,b,c} -> leaf.
    expect(report?.maxDepth).toBe(1);
  });

  it("keeps test files out of the graph", () => {
    const { report } = run({ "src/a.ts": `import "./b";`, "src/b.ts": ``, "src/__tests__/a.test.ts": `import "../a"; import "../b";` });
    expect(report?.modules).toBe(2);
    expect(report?.edges).toBe(1);
  });

  it("handles a 7,000-file chain and a 7,000-file cycle without overflowing the stack", () => {
    const n = 7000;
    const chain = Array.from({ length: n }, (_, i) => (i + 1 < n ? [i + 1] : []));
    expect(stronglyConnected(chain)).toHaveLength(n);
    const ring = Array.from({ length: n }, (_, i) => [(i + 1) % n]);
    expect(stronglyConnected(ring)).toHaveLength(1);

    const measured = Array.from({ length: n }, (_, i) => fm(`src/m${String(i).padStart(5, "0")}.ts`));
    const edges = new Map<string, Set<string>>();
    for (let i = 0; i + 1 < n; i++) edges.set(measured[i].path, new Set([measured[i + 1].path]));
    const report = analyseStructure(measured, { edges, internalTried: n - 1, unresolved: 0 });
    expect(report?.maxDepth).toBe(n - 1);
    expect(report?.cycleCount).toBe(0);
    edges.set(measured[n - 1].path, new Set([measured[0].path]));
    const looped = analyseStructure(measured, { edges, internalTried: n, unresolved: 0 });
    expect(looped?.cycleCount).toBe(1);
    expect(looped?.cycles[0].path).toHaveLength(n + 1);
  });

  it("names a hub only when it is both depended on and complex: a simple file everyone uses is good design", () => {
    const repo: Record<string, string> = { "src/core.ts": ``, "src/util.ts": ``, "src/simple.ts": `` };
    for (let i = 0; i < 8; i++) repo[`src/f${i}.ts`] = `import "./core"; import "./simple";`;
    for (let i = 0; i < 20; i++) repo[`src/g${i}.ts`] = `import "./util";`;
    const { report } = run(repo, { "src/core.ts": 40, "src/simple.ts": 39, "src/util.ts": 1 });
    // util.ts is imported by 20 files but is simple, like a shared error type: not a risk.
    expect(report?.hubs.map((h) => h.path)).toEqual(["src/core.ts"]);
    const core = report!.hubs[0];
    expect(core).toMatchObject({ fanIn: 8, fanOut: 0, instability: 0, complexity: 40 });
  });

  it("returns null when nothing looked internal: no graph is not the same as no coupling", () => {
    const { report } = run({ "src/a.ts": `import React from "react";`, "main.swift": "import UIKit" });
    expect(report).toBeNull();
  });

  it("reports a graph of all misses as unresolved rather than null", () => {
    const { report } = run({ "src/a.ts": `import "./missing";` });
    expect(report).toMatchObject({ edges: 0, unresolvedShare: 1, cycleCount: 0 });
  });
});
