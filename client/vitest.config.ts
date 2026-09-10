import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Mirrors vite.config.ts's React plugin (needed if any test ever renders JSX)
// but deliberately skips vite-plugin-node-polyfills — nothing under test today
// pulls in siwe/ethers's Buffer-dependent code paths, and jsdom already
// supplies a real `localStorage` for tutorialStorage.test.ts without it.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
  },
});
