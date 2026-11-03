import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests run in a plain Node environment. The `@` alias mirrors tsconfig's
// paths so test files can import from `@/…` the same way the app does.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // Next compiles the app with the automatic JSX runtime (tsconfig says "preserve" and hands the
  // transform to Next). esbuild defaults to the CLASSIC runtime, which needs a `React` in scope,
  // so without this every component test fails with "React is not defined" — and the natural
  // workaround, importing React into each test, would have test files compiled differently from
  // the components they render.
  esbuild: { jsx: "automatic" },
  // ⚠️ Vitest 4 transforms with Rolldown/oxc, NOT esbuild, so the key above is dead there and
  // this one does the work. Both are kept so the runtime is right either side of that upgrade.
  // Remove this line and 32 files stop parsing — 3216 tests collapse to 2868, because tsconfig
  // says `jsx: "preserve"` (Next needs that) and Rolldown refuses to parse the JSX it leaves.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Stubs the layout APIs jsdom omits. Without it ProseMirror throws from
    // `focus()` as an UNHANDLED async error, which lands on whichever test is
    // in flight — a flake that failed two unrelated files in one run and none
    // in the next six. See the file for the reproduction.
    setupFiles: ["./vitest.setup.ts"],
  },
});
