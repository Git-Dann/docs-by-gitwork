/**
 * A tiny, dependency-free tokeniser for the code block.
 *
 * Deliberately NOT a syntax highlighter library. This exists to make a data-ingestion guide
 * readable — field names, types, keys, comments — and those are the same handful of token classes
 * in every format a client actually receives. Pulling in Shiki or Prism would add hundreds of KB
 * to a document that is often printed to PDF, where highlighting contributes nothing.
 *
 * Returns TOKENS, never HTML, for the same reason `src/lib/markdown.tsx` does: the renderer maps
 * them to React elements, so there is no `dangerouslySetInnerHTML` anywhere near client content.
 *
 * Pure and framework-free, so it is unit-testable and can run on either side.
 */

export type TokenKind = "plain" | "key" | "string" | "number" | "keyword" | "comment" | "punct";

export interface Token {
  kind: TokenKind;
  text: string;
}

/** The formats worth offering — what a data-ingestion guide actually contains. */
export const CODE_LANGUAGES = [
  "JSON",
  "SQL",
  "CSV",
  "YAML",
  "Bash",
  "TypeScript",
  "Python",
  "Plain text",
] as const;

export type CodeLanguage = (typeof CODE_LANGUAGES)[number];

const SQL_KEYWORDS = new Set([
  "select","from","where","join","left","right","inner","outer","on","group","by","order","having",
  "insert","into","values","update","set","delete","create","table","alter","add","drop","primary",
  "key","foreign","references","not","null","unique","index","and","or","as","distinct","limit",
  "offset","union","all","case","when","then","else","end","with","returning","default","constraint",
]);

const TS_KEYWORDS = new Set([
  "const","let","var","function","return","if","else","for","while","import","export","from","type",
  "interface","class","extends","implements","new","await","async","try","catch","finally","throw",
  "typeof","instanceof","null","undefined","true","false","this","default",
]);

const PY_KEYWORDS = new Set([
  "def","return","if","elif","else","for","while","import","from","as","class","try","except",
  "finally","raise","with","lambda","None","True","False","and","or","not","in","is","pass","yield",
]);

function keywordsFor(language: string): Set<string> | null {
  switch (language) {
    case "SQL":
      return SQL_KEYWORDS;
    case "TypeScript":
      return TS_KEYWORDS;
    case "Python":
      return PY_KEYWORDS;
    default:
      return null;
  }
}

/** Line-comment opener per language, or null where the format has no comments. */
function lineCommentFor(language: string): string | null {
  switch (language) {
    case "SQL":
      return "--";
    case "YAML":
    case "Bash":
    case "Python":
      return "#";
    case "TypeScript":
      return "//";
    default:
      return null;
  }
}

/**
 * Tokenise ONE line. Line-scoped on purpose: the renderer needs lines anyway (line numbers, and
 * wrapping in print), and a line-scoped lexer cannot run away on a malformed multi-line string —
 * the worst case is one line highlighted oddly rather than the rest of the file swallowed.
 */
export function tokenizeLine(line: string, language: string): Token[] {
  const comment = lineCommentFor(language);
  if (comment) {
    const at = indexOfCommentOutsideString(line, comment);
    if (at >= 0) {
      const before = line.slice(0, at);
      return [
        ...(before ? tokenizeCode(before, language) : []),
        { kind: "comment", text: line.slice(at) },
      ];
    }
  }
  return tokenizeCode(line, language);
}

/**
 * Where a line comment starts, ignoring occurrences inside a quoted string.
 *
 * This matters: a URL in a config file contains `//`, and a naive search truncates
 * `"https://api.example.com/v1"` at the scheme — the same bug the Pulse checks hit twice
 * (CLAUDE.md §34.3, §34.6). A path in CSV or SQL routinely contains `#` too.
 */
function indexOfCommentOutsideString(line: string, opener: string): number {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quote) {
      if (char === "\\") {
        i += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (line.startsWith(opener, i)) return i;
  }
  return -1;
}

const TOKEN_RE =
  /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|([{}[\]():,;=<>|&+\-*/])/g;

function tokenizeCode(source: string, language: string): Token[] {
  const keywords = keywordsFor(language);
  const tokens: Token[] = [];
  let last = 0;

  for (const match of source.matchAll(TOKEN_RE)) {
    const at = match.index ?? 0;
    if (at > last) tokens.push({ kind: "plain", text: source.slice(last, at) });
    const [text, quoted, num, word, punct] = match;

    if (quoted) {
      // In JSON and YAML a quoted run followed by a colon is a KEY, not a value — which is the
      // single most useful distinction in an ingestion guide, since the keys are the contract.
      const rest = source.slice(at + text.length);
      const isKey = /^\s*:/.test(rest) && (language === "JSON" || language === "YAML");
      tokens.push({ kind: isKey ? "key" : "string", text });
    } else if (num) {
      tokens.push({ kind: "number", text });
    } else if (word) {
      if (keywords?.has(word.toLowerCase())) {
        tokens.push({ kind: "keyword", text });
      } else {
        // Unquoted YAML keys (`customer_id:`) are the common case in a field list.
        const rest = source.slice(at + text.length);
        const isKey = /^\s*:/.test(rest) && language === "YAML";
        tokens.push({ kind: isKey ? "key" : "plain", text });
      }
    } else if (punct) {
      tokens.push({ kind: "punct", text });
    }
    last = at + text.length;
  }

  if (last < source.length) tokens.push({ kind: "plain", text: source.slice(last) });
  return tokens;
}

/** Split into lines and tokenise each. Trailing blank line dropped so it doesn't print an empty row. */
export function tokenizeCodeBlock(code: string, language: string): Token[][] {
  const lines = code.replace(/\n+$/, "").split("\n");
  return lines.map((line) => tokenizeLine(line, language));
}
