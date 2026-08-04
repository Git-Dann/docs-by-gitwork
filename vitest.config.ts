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
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
