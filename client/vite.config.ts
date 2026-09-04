import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    react(),
    // siwe's EIP-4361 parser (@spruceid/siwe-parser) calls Buffer.from() at
    // runtime, which doesn't exist in a browser bundle without this. Scoped to
    // just buffer/process/global — NOT `crypto`, which would otherwise pull in
    // crypto-browserify's vulnerable `elliptic` dependency chain for a module
    // we never actually need (all real signing happens in the wallet extension).
    nodePolyfills({ include: ["buffer", "process"] }),
  ],
});
