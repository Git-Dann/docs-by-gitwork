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
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
