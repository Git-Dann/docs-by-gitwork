import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      // Claude Code creates a git worktree per session under .claude/worktrees —
      // a nested checkout of this repo inside itself. ESLint walked into them
      // and linted every file a second (and tenth) time, which is why a local
      // `npm run verify` reported ~28,000 errors and could not pass for anyone
      // with an active session, while CI stayed green: CI clones fresh and has
      // no worktrees. The errors were never in this codebase.
      ".claude/**",
      // Vendored upstream app — built by its own toolchain (vendor/bento/README.md).
      "vendor/**",
      ".next/**",
      ".next*/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "**/* 2.ts",
      "**/* 2.tsx",
      "**/* 2.mts",
    ],
  },
];

export default eslintConfig;
