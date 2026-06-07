import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// NOTE: Omniston SDK + TON libs (@ston-fi/omniston-sdk, @dynamic-labs/ton) pull in
// `buffer`/`crypto`/`stream` Node builtins at runtime. Without node-polyfills the
// browser bundle throws "Buffer is not defined" on first quote/HTLC call.
// Same fix Polygram needed for the Polymarket SDKs.
export default defineConfig({
  plugins: [
    // TanStackRouterVite MUST run before react() — it generates routeTree.gen.ts
    // from src/routes/ which the app imports.
    TanStackRouterVite({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    nodePolyfills({
      include: ["buffer", "crypto", "stream", "util", "process"],
      globals: { Buffer: true, process: true },
      protocolImports: true,
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5174,
  },
  build: {
    // The Dynamic + wallet-connector bundle is large; split heavy vendors into
    // their own chunks so the initial parse isn't one 6MB file. Doesn't change
    // total bytes, just improves caching + first-load parse on mobile.
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          dynamic: [
            "@dynamic-labs/sdk-react-core",
            "@dynamic-labs/ethereum",
            // TEMP (test/sdk-3.6.2): @dynamic-labs/ton removed — no 3.x version.
          ],
          omniston: ["@ston-fi/omniston-sdk", "@ston-fi/omniston-sdk-react"],
          viem: ["viem"],
        },
      },
    },
  },
});
