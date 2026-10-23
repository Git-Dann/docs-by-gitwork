import { describe, expect, it } from "vitest";
import { parserFor } from "../grammar";
import { LANGUAGE_RULES } from "../languages";
import { measureTree, type MeasureNode } from "../measure";
import type { CodeLanguage, FunctionMeasure } from "@/types/code-health";

/**
 * Real parses, one per language. The rules name grammar node types, and a wrong name
 * fails silently (that construct just stops counting), so these run the actual parser.
 * Every expected complexity is counted by hand: 1 + each if / loop / case / catch /
 * ternary / && / || / ?? in the function's own body.
 */
async function measure(lang: CodeLanguage, src: string) {
  const p = await parserFor(lang);
  const tree = p.parse(src);
  try {
    return measureTree(tree.rootNode as unknown as MeasureNode, LANGUAGE_RULES[lang], src.split("\n").length);
  } finally {
    tree.delete();
    p.delete();
  }
}

const fn = (fns: FunctionMeasure[], name: string) => {
  const f = fns.find((x) => x.name === name);
  if (!f) throw new Error(`no function ${name} in ${fns.map((x) => x.name).join(", ")}`);
  return f;
};

describe("measureTree, per language", () => {
  it("TypeScript: branches, short-circuits, nesting, params; else-if is not deeper", async () => {
    const m = await measure("typescript", `
export function pick(a: number, b?: string, ...rest: number[]) {
  if (a > 1 && b) {
    for (const r of rest) {
      if (r) return r ?? 0;
    }
  } else if (a < 0 || !b) {
    return a ? 1 : 2;
  }
  return 0;
}
`);
    const f = fn(m.functions, "pick");
    // if, &&, for, if, ??, else-if, ||, ternary
    expect(f.complexity).toBe(9);
    expect(f.params).toBe(3);
    expect(f.maxNesting).toBe(3);
    expect(f.startLine).toBe(2);
  });

  it("TSX: a named arrow component counts, an anonymous callback belongs to it", async () => {
    const m = await measure("tsx", `
export const List = ({ items }: { items: string[] }) => {
  return <ul>{items.map((i) => (i ? <li key={i}>{i}</li> : null))}</ul>;
};
`);
    expect(m.functions.map((f) => f.name)).toEqual(["List"]);
    expect(fn(m.functions, "List").complexity).toBe(2); // the ternary inside the callback
  });

  it("JavaScript: methods belong to their class and add to its weighted complexity", async () => {
    const m = await measure("javascript", `
class Cart {
  add(item) { if (!item) throw new Error(); this.items.push(item); }
  total() { return this.items.reduce((s, i) => s + (i.qty || 1) * i.price, 0); }
}
`);
    expect(fn(m.functions, "add").owner).toBe("Cart");
    expect(fn(m.functions, "total").complexity).toBe(2);
    expect(m.classes).toEqual([expect.objectContaining({ name: "Cart", methods: 2, wmc: 4 })]);
  });

  it("Python: self is not a parameter; elif, and/or, comprehension ifs count", async () => {
    const m = await measure("python", `
class Shop:
    def price(self, item, discount=0, *args, **kw):
        if item is None or discount < 0:
            return 0
        elif discount and item.sale:
            return [x for x in args if x]
        return item.cost
`);
    const f = fn(m.functions, "price");
    // if, or, elif, and, comprehension for, comprehension if
    expect(f.complexity).toBe(7);
    expect(f.params).toBe(4);
    expect(f.owner).toBe("Shop");
  });

  it("Swift: guard and switch cases count, default does not", async () => {
    const m = await measure("swift", `
class Router {
  func route(_ path: String, user: User?) -> Int {
    guard let u = user else { return 0 }
    switch path {
    case "a": return 1
    case "b": return u.admin ? 2 : 3
    default: return 4
    }
  }
}
`);
    const f = fn(m.functions, "route");
    // guard, case a, case b, ternary
    expect(f.complexity).toBe(5);
    expect(f.params).toBe(2);
    expect(f.owner).toBe("Router");
  });

  it("Kotlin: when branches count, else does not; ?: counts", async () => {
    const m = await measure("kotlin", `
class Fees {
  fun fee(kind: String, amount: Int?): Int {
    val a = amount ?: 0
    return when (kind) {
      "card" -> a / 50
      "bank" -> 0
      else -> a
    }
  }
}
`);
    const f = fn(m.functions, "fee");
    expect(f.complexity).toBe(4);
    expect(f.params).toBe(2);
    expect(f.owner).toBe("Fees");
  });

  it("Java: switch labels count, default does not; catch counts", async () => {
    const m = await measure("java", `
class Io {
  int read(String p, int n) {
    try {
      switch (n) { case 1: return 1; case 2: return 2; default: return 0; }
    } catch (Exception e) { return -1; }
  }
}
`);
    const f = fn(m.functions, "read");
    expect(f.complexity).toBe(4);
    expect(f.params).toBe(2);
  });

  it("Go: a method receiver is not a parameter", async () => {
    const m = await measure("go", `
package x
func (s *Server) Serve(addr string, n int) error {
  for i := 0; i < n; i++ {
    if i > 0 && addr != "" { return nil }
  }
  return nil
}
`);
    const f = fn(m.functions, "Serve");
    expect(f.params).toBe(2);
    expect(f.complexity).toBe(4);
  });

  it("PHP: methods, foreach and ?? count", async () => {
    const m = await measure("php", `<?php
class Basket {
  public function sum(array $items, ?int $cap = null) {
    $t = 0;
    foreach ($items as $i) { if ($i > 0) { $t += $i; } }
    return $cap ?? $t;
  }
}
`);
    const f = fn(m.functions, "sum");
    expect(f.complexity).toBe(4);
    expect(f.params).toBe(2);
    expect(f.owner).toBe("Basket");
  });

  it("lines of code exclude blanks and comment-only lines", async () => {
    const m = await measure("typescript", `// header

/** doc */
function a() {
  // note
  return 1;
}
`);
    expect(m.loc).toBe(3);
    expect(fn(m.functions, "a").loc).toBe(3);
  });

  it("a nested function's branches are not added to the function around it", async () => {
    const m = await measure("javascript", `
function outer(x) {
  function inner(y) { if (y) return 1; if (!y) return 2; return 3; }
  return inner(x);
}
`);
    expect(fn(m.functions, "outer").complexity).toBe(1);
    expect(fn(m.functions, "inner").complexity).toBe(3);
    expect(fn(m.functions, "inner").owner).toBeNull();
  });
});
