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
