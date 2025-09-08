/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["tests/setup.ts"],
    testTimeout: 10000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
    include: ["tests/**/*.test.ts"],
    css: true,
    mockReset: true,
    deps: {
      inline: [
        "@testing-library/user-event",
        "@testing-library/react",
        "@testing-library/jest-dom",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  define: {
    "process.env": {},
  },
});
