import type { LanguageRules } from "./languages";
import type { ClassMeasure, FunctionMeasure } from "@/types/code-health";

/**
 * The parts of a tree-sitter node this file reads. web-tree-sitter's `SyntaxNode` satisfies
 * it; tests build plain objects.
 */
export interface MeasureNode {
  type: string;
  isNamed(): boolean;
  children: MeasureNode[];
  parent: MeasureNode | null;
  startPosition: { row: number };
  /** Byte offset; nodes are compared by position, never by object identity (see measureTree). */
  startIndex: number;
  endPosition: { row: number };
  childForFieldName(name: string): MeasureNode | null;
  text: string;
}

interface FunctionFrame {
  seq: number;
  node: MeasureNode;
  name: string;
  owner: ClassFrame | null;
  complexity: number;
  params: number;
  depth: number;
  maxNesting: number;
}

interface ClassFrame {
  seq: number;
  node: MeasureNode;
  name: string;
  methods: number;
  wmc: number;
}

export interface TreeMeasure {
  functions: FunctionMeasure[];
  classes: ClassMeasure[];
  /** Lines (0-based) holding at least one non-comment token. */
  codeLines: Uint8Array;
  loc: number;
}

const NAME_TYPES = /^(identifier|simple_identifier|type_identifier|property_identifier|field_identifier|name|constant|private_property_identifier)$/;

/** The declared name of a function or class, or null when it has none of its own. */
function ownName(node: MeasureNode): string | null {
  const field = node.childForFieldName("name");
  if (field) return field.text.slice(0, 120);
  // Kotlin and some Swift nodes carry no `name` field: the first identifier child is the name.
  for (const c of node.children) if (NAME_TYPES.test(c.type)) return c.text.slice(0, 120);
  return null;
}

/**
 * The name an inline function is given by what it is assigned to, or null when it is an
 * anonymous callback that belongs to the function around it.
 */
function assignedName(node: MeasureNode): string | null {
  const own = node.childForFieldName("name");
  if (own) return own.text.slice(0, 120);
  const p = node.parent;
  if (!p) return null;
  switch (p.type) {
    case "variable_declarator": // const Page = () => {}
    case "public_field_definition": // class field = () => {}
    case "field_definition":
      return (p.childForFieldName("name") ?? p.children[0])?.text.slice(0, 120) ?? null;
    case "pair": // { onClick: () => {} }
      return p.childForFieldName("key")?.text.slice(0, 120) ?? null;
    case "assignment_expression": // module.exports.x = function () {}
      return p.childForFieldName("left")?.text.slice(0, 120) ?? null;
    case "export_statement": // export default () => {}
      return "default export";
    default:
      return null;
  }
}

/** `else if` is a continuation of the same choice, not a block nested inside it. */
function isElseIf(node: MeasureNode): boolean {
  const p = node.parent;
  if (!p) return false;
  if (p.type === node.type) return true; // Java/Swift: the `alternative` of an if is the next if
  if (p.type.includes("else")) return true; // JS else_clause, PHP else_clause
  if (p.type === "control_structure_body") {
    // Kotlin: if_expression > control_structure_body > if_expression, after an `else` keyword.
    const gp = p.parent;
    if (gp && gp.type === node.type) {
      const i = gp.children.findIndex((c) => c.startIndex === p.startIndex && c.type === p.type);
      return i > 0 && gp.children[i - 1].type === "else";
    }
  }
  return false;
}

function countParams(fn: MeasureNode, rules: LanguageRules): number {
  let count = 0;
  const countIn = (list: MeasureNode) => {
    for (const c of list.children) {
      if (!c.isNamed() || !rules.parameters.has(c.type)) continue;
      if (count === 0 && rules.implicitParameters?.has(c.text)) continue;
      count++;
    }
  };
  // Prefer the grammar's own `parameters` field: a Go method's receiver is also a
  // parameter_list, and it is not a parameter.
  const field = fn.childForFieldName("parameters");
  if (field && rules.parameterLists.has(field.type)) {
    countIn(field);
    return count;
  }
  for (const c of fn.children) if (rules.parameterLists.has(c.type)) countIn(c);
  // Swift lists its parameters directly under the declaration.
  if (rules.parameterLists.size === 0) countIn(fn);
  return count;
}

function isLogical(node: MeasureNode, rules: LanguageRules): boolean {
  if (!rules.logicalExpressions.has(node.type)) return false;
  // Languages that model each operator as its own node type list the type itself.
  if (rules.logicalOperators.has(node.type)) return true;
  for (const c of node.children) if (!c.isNamed() && rules.logicalOperators.has(c.type)) return true;
  return false;
}

/**
 * One pass over a syntax tree. Functions and classes are tracked on stacks so a method is
 * attributed to the class it is written in and a nested function's branches are not
 * added to the function around it.
 */
export function measureTree(root: MeasureNode, rules: LanguageRules, lineCount: number): TreeMeasure {
  const codeLines = new Uint8Array(Math.max(lineCount, root.endPosition.row + 1));
  const functions: FunctionMeasure[] = [];
  const classes: ClassMeasure[] = [];
  const fnStack: FunctionFrame[] = [];
  const classStack: ClassFrame[] = [];
  // Order in which frames were opened. A method belongs to the innermost class opened
  // after the innermost enclosing function. Compared by order, not object identity:
  // web-tree-sitter hands back a new object each time a node's parent is read.
  let seq = 0;

  // Iterative depth-first walk with explicit exit markers, so a deeply nested file cannot
  // overflow the call stack.
  const work: Array<{ node: MeasureNode; exit: boolean; nested?: boolean }> = [{ node: root, exit: false }];
  while (work.length > 0) {
    const item = work.pop()!;
    const n = item.node;

    if (item.exit) {
      if (item.nested) fnStack[fnStack.length - 1].depth--;
      const topFn = fnStack[fnStack.length - 1];
      if (topFn && topFn.node === n) {
        fnStack.pop();
        const m = finishFunction(topFn, codeLines);
        functions.push(m);
        if (topFn.owner) {
          topFn.owner.methods++;
          topFn.owner.wmc += m.complexity;
        }
      }
      const topClass = classStack[classStack.length - 1];
      if (topClass && topClass.node === n) {
        classStack.pop();
        classes.push(finishClass(topClass, codeLines));
      }
      continue;
    }

    // Leaves mark their lines as code, unless they are comments.
    if (n.children.length === 0) {
      if (!n.type.includes("comment")) {
        for (let r = n.startPosition.row; r <= n.endPosition.row && r < codeLines.length; r++) codeLines[r] = 1;
      }
      continue;
    }

    let pushedExit = false;
    const pushExit = (nested = false) => {
      if (!pushedExit) work.push({ node: n, exit: true, nested });
      pushedExit = true;
    };

    if (rules.classes.has(n.type)) {
      classStack.push({ seq: seq++, node: n, name: ownName(n) ?? "(anonymous class)", methods: 0, wmc: 0 });
      pushExit();
    }

    const isFunction = rules.functions.has(n.type);
    const inlineName = !isFunction && rules.inlineFunctions.has(n.type) ? assignedName(n) : null;
    if (isFunction || inlineName) {
      // A method belongs to a class only when no other function sits between them.
      const cls = classStack[classStack.length - 1];
      const enclosingFn = fnStack[fnStack.length - 1];
      const owner = cls && (!enclosingFn || cls.seq > enclosingFn.seq) ? cls : null;
      fnStack.push({
        seq: seq++,
        node: n,
        name: (isFunction ? ownName(n) : inlineName) ?? (n.type.includes("constructor") || n.type.startsWith("init") ? "constructor" : "(anonymous)"),
        owner,
        complexity: 1,
        params: countParams(n, rules),
        depth: 0,
        maxNesting: 0,
      });
      pushExit();
    } else {
      const fn = fnStack[fnStack.length - 1];
      if (fn) {
        if (rules.decisions.has(n.type) && !rules.defaultBranch?.(n)) fn.complexity++;
        else if (isLogical(n, rules)) fn.complexity++;
        if (rules.nesting.has(n.type) && !isElseIf(n)) {
          fn.depth++;
          fn.maxNesting = Math.max(fn.maxNesting, fn.depth);
          // Its exit marker undoes the depth. A node can be both a class and a nesting node
          // in no grammar we use, so the single exit marker is safe.
          work.push({ node: n, exit: true, nested: true });
          pushedExit = true;
        }
      }
    }

    for (let i = n.children.length - 1; i >= 0; i--) work.push({ node: n.children[i], exit: false });
  }

  let loc = 0;
  for (const v of codeLines) loc += v;
  return { functions, classes, codeLines, loc };
}

function locBetween(codeLines: Uint8Array, start: number, end: number): number {
  let n = 0;
  for (let r = start; r <= end && r < codeLines.length; r++) n += codeLines[r];
  return n;
}

function finishFunction(f: FunctionFrame, codeLines: Uint8Array): FunctionMeasure {
  const start = f.node.startPosition.row;
  const end = f.node.endPosition.row;
  return {
    name: f.name,
    owner: f.owner?.name ?? null,
    startLine: start + 1,
    endLine: end + 1,
    loc: locBetween(codeLines, start, end),
    complexity: f.complexity,
    params: f.params,
    maxNesting: f.maxNesting,
  };
}

function finishClass(c: ClassFrame, codeLines: Uint8Array): ClassMeasure {
  const start = c.node.startPosition.row;
  const end = c.node.endPosition.row;
  return { name: c.name, startLine: start + 1, endLine: end + 1, loc: locBetween(codeLines, start, end), methods: c.methods, wmc: c.wmc };
}
