import type { CodeLanguage } from "@/types/code-health";

/**
 * What each language's syntax tree calls a function, a class, a decision and a nested
 * block. The node names were read off real parses of each grammar (tree-sitter-wasms
 * 0.1.13 on web-tree-sitter 0.20.8), not from documentation: grammars name the same idea
 * differently (`if_statement`, `if_expression`, `guard_statement`), and a name that is
 * wrong here silently stops that construct being counted.
 */
export interface LanguageRules {
  /** The grammar's wasm file in tree-sitter-wasms/out. */
  grammar: string;
  /** Always a function of its own. */
  functions: ReadonlySet<string>;
  /**
   * Arrows, lambdas and closures. A function of their own only when NAMED (assigned to a
   * variable, property or field): `const Page = () => {…}` is a component, but the
   * callback in `items.map(x => x + 1)` is part of the function it sits in, and counting
   * every callback separately would bury the real functions under hundreds of one-liners.
   */
  inlineFunctions: ReadonlySet<string>;
  classes: ReadonlySet<string>;
  /** Each one adds a path through the code (McCabe). */
  decisions: ReadonlySet<string>;
  /** A decision node that is the default branch (`default:`, `else ->`) adds no path. */
  defaultBranch?: (node: SyntaxNodeLike) => boolean;
  /** Expression node types whose operator may be a short-circuit (`&&`, `||`, `??`, `and`). */
  logicalExpressions: ReadonlySet<string>;
  logicalOperators: ReadonlySet<string>;
  /** Control structures that deepen nesting. */
  nesting: ReadonlySet<string>;
  /** Parameter lists, whose parameter children are counted. */
  parameterLists: ReadonlySet<string>;
  /** Parameter node types inside those lists (or directly under the function, for Swift). */
  parameters: ReadonlySet<string>;
  /** First parameters that are not really parameters (`self`, `cls`). */
  implicitParameters?: ReadonlySet<string>;
  /**
   * Dart only: a function's body is the SIBLING of its signature, not its child
   * (`method_signature` then `function_body` under the class body). The body node is
   * measured as the function, and its name and parameters are read off the signature
   * immediately before it.
   */
  bodyAfterSignature?: { body: string; signatures: ReadonlySet<string> };
}

/** The subset of a tree-sitter node the rules look at, so they can be tested without a parser. */
export interface SyntaxNodeLike {
  type: string;
  children: (SyntaxNodeLike | null)[];
}

const set = (...xs: string[]) => new Set(xs);
const hasKeyword = (n: SyntaxNodeLike, kw: string) => n.children.some((c) => c?.type === kw);

const JS_LIKE: Omit<LanguageRules, "grammar"> = {
  functions: set("function_declaration", "generator_function_declaration", "method_definition"),
  inlineFunctions: set("arrow_function", "function_expression", "function", "generator_function"),
  classes: set("class_declaration", "abstract_class_declaration", "class"),
  decisions: set("if_statement", "for_statement", "for_in_statement", "while_statement", "do_statement", "switch_case", "catch_clause", "ternary_expression"),
  logicalExpressions: set("binary_expression"),
  logicalOperators: set("&&", "||", "??"),
  nesting: set("if_statement", "for_statement", "for_in_statement", "while_statement", "do_statement", "switch_statement", "catch_clause"),
  parameterLists: set("formal_parameters"),
  parameters: set("required_parameter", "optional_parameter", "identifier", "assignment_pattern", "rest_pattern", "object_pattern", "array_pattern"),
};

export const LANGUAGE_RULES: Record<CodeLanguage, LanguageRules> = {
  typescript: { grammar: "typescript", ...JS_LIKE },
  tsx: { grammar: "tsx", ...JS_LIKE },
  javascript: { grammar: "javascript", ...JS_LIKE },
  python: {
    grammar: "python",
    functions: set("function_definition"),
    inlineFunctions: set("lambda"),
    classes: set("class_definition"),
    decisions: set("if_statement", "elif_clause", "for_statement", "while_statement", "except_clause", "conditional_expression", "for_in_clause", "if_clause", "case_clause"),
    logicalExpressions: set("boolean_operator"),
    logicalOperators: set("and", "or"),
    nesting: set("if_statement", "for_statement", "while_statement", "try_statement", "with_statement", "match_statement"),
    parameterLists: set("parameters"),
    parameters: set("identifier", "default_parameter", "typed_parameter", "typed_default_parameter", "list_splat_pattern", "dictionary_splat_pattern"),
    implicitParameters: set("self", "cls"),
  },
  swift: {
    grammar: "swift",
    functions: set("function_declaration", "init_declaration", "deinit_declaration"),
    inlineFunctions: set("lambda_literal"),
    classes: set("class_declaration", "protocol_declaration"),
    decisions: set("if_statement", "guard_statement", "for_statement", "while_statement", "repeat_while_statement", "switch_entry", "catch_block", "ternary_expression"),
    defaultBranch: (n) => n.type === "switch_entry" && (hasKeyword(n, "default_keyword") || hasKeyword(n, "default")),
    logicalExpressions: set("conjunction_expression", "disjunction_expression", "nil_coalescing_expression"),
    // Swift's logical expressions are their own node types, so the operator check is the type itself.
    logicalOperators: set("conjunction_expression", "disjunction_expression", "nil_coalescing_expression"),
    nesting: set("if_statement", "guard_statement", "for_statement", "while_statement", "repeat_while_statement", "switch_statement", "catch_block"),
    parameterLists: set(),
    parameters: set("parameter"),
  },
  kotlin: {
    grammar: "kotlin",
    functions: set("function_declaration", "secondary_constructor", "anonymous_function", "getter", "setter"),
    inlineFunctions: set("lambda_literal"),
    classes: set("class_declaration", "object_declaration", "companion_object"),
    decisions: set("if_expression", "when_entry", "for_statement", "while_statement", "do_while_statement", "catch_block"),
    defaultBranch: (n) => n.type === "when_entry" && hasKeyword(n, "else"),
    logicalExpressions: set("conjunction_expression", "disjunction_expression", "elvis_expression"),
    logicalOperators: set("conjunction_expression", "disjunction_expression", "elvis_expression"),
    nesting: set("if_expression", "when_expression", "for_statement", "while_statement", "do_while_statement", "catch_block"),
    parameterLists: set("function_value_parameters"),
    parameters: set("parameter"),
  },
  java: {
    grammar: "java",
    functions: set("method_declaration", "constructor_declaration", "compact_constructor_declaration"),
    inlineFunctions: set("lambda_expression"),
    classes: set("class_declaration", "interface_declaration", "enum_declaration", "record_declaration"),
    decisions: set("if_statement", "for_statement", "enhanced_for_statement", "while_statement", "do_statement", "switch_label", "catch_clause", "ternary_expression"),
    defaultBranch: (n) => n.type === "switch_label" && hasKeyword(n, "default"),
    logicalExpressions: set("binary_expression"),
    logicalOperators: set("&&", "||"),
    nesting: set("if_statement", "for_statement", "enhanced_for_statement", "while_statement", "do_statement", "switch_expression", "switch_statement", "catch_clause"),
    parameterLists: set("formal_parameters"),
    parameters: set("formal_parameter", "spread_parameter"),
  },
  go: {
    grammar: "go",
    functions: set("function_declaration", "method_declaration"),
    inlineFunctions: set("func_literal"),
    classes: set(),
    decisions: set("if_statement", "for_statement", "expression_case", "type_case", "communication_case"),
    logicalExpressions: set("binary_expression"),
    logicalOperators: set("&&", "||"),
    nesting: set("if_statement", "for_statement", "expression_switch_statement", "type_switch_statement", "select_statement"),
    parameterLists: set("parameter_list"),
    parameters: set("parameter_declaration", "variadic_parameter_declaration"),
  },
  php: {
    grammar: "php",
    functions: set("function_definition", "method_declaration"),
    inlineFunctions: set("arrow_function", "anonymous_function_creation_expression"),
    classes: set("class_declaration", "trait_declaration", "interface_declaration", "enum_declaration"),
    decisions: set("if_statement", "else_if_clause", "for_statement", "foreach_statement", "while_statement", "do_statement", "case_statement", "catch_clause", "conditional_expression"),
    logicalExpressions: set("binary_expression"),
    logicalOperators: set("&&", "||", "??", "and", "or"),
    nesting: set("if_statement", "for_statement", "foreach_statement", "while_statement", "do_statement", "switch_statement", "catch_clause"),
    parameterLists: set("formal_parameters"),
    parameters: set("simple_parameter", "variadic_parameter", "property_promotion_parameter"),
  },
  dart: {
    grammar: "dart",
    functions: set(),
    bodyAfterSignature: { body: "function_body", signatures: set("method_signature", "function_signature", "declaration") },
    inlineFunctions: set("function_expression"),
    classes: set("class_definition", "mixin_declaration", "extension_declaration", "enum_declaration"),
    decisions: set("if_statement", "for_statement", "while_statement", "do_statement", "switch_statement_case", "switch_expression_case", "catch_clause", "conditional_expression", "if_element", "for_element"),
    logicalExpressions: set("logical_and_expression", "logical_or_expression", "if_null_expression"),
    logicalOperators: set("logical_and_expression", "logical_or_expression", "if_null_expression"),
    nesting: set("if_statement", "for_statement", "while_statement", "do_statement", "switch_statement", "try_statement"),
    parameterLists: set("formal_parameter_list", "optional_formal_parameters"),
    parameters: set("formal_parameter"),
  },
  ruby: {
    grammar: "ruby",
    functions: set("method", "singleton_method"),
    inlineFunctions: set("lambda"),
    classes: set("class", "module", "singleton_class"),
    decisions: set("if", "elsif", "unless", "while", "until", "for", "when", "rescue", "conditional", "if_modifier", "unless_modifier", "while_modifier", "until_modifier", "rescue_modifier"),
    logicalExpressions: set("binary"),
    logicalOperators: set("&&", "||", "and", "or"),
    nesting: set("if", "unless", "while", "until", "for", "case", "begin"),
    parameterLists: set("method_parameters"),
    parameters: set("identifier", "optional_parameter", "splat_parameter", "keyword_parameter", "hash_splat_parameter", "block_parameter"),
  },
};

/** File extension → language. `.d.ts` is declarations only, so it is excluded upstream. */
export const EXTENSION_LANGUAGE: Record<string, CodeLanguage> = {
  ".ts": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".jsx": "javascript",
  ".py": "python",
  ".swift": "swift",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".java": "java",
  ".go": "go",
  ".php": "php",
  ".dart": "dart",
  ".rb": "ruby",
};

/**
 * Source languages we recognise but cannot measure yet. Counted so the report can say
 * "these Dart files were not analysed" instead of reporting a smaller repo than there is.
 * Each needs a grammar and a LanguageRules entry here, checked against real parses.
 */
export const UNSUPPORTED_SOURCE_EXTENSIONS: Record<string, string> = {
  ".cs": "C#",
  ".rs": "Rust",
  ".c": "C",
  ".cc": "C++",
  ".cpp": "C++",
  ".m": "Objective-C",
  ".scala": "Scala",
  ".ex": "Elixir",
  ".vue": "Vue",
  ".svelte": "Svelte",
};
