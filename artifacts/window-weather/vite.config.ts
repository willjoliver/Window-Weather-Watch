import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 5173;

if (rawPort && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";

// Build plugins array and only attempt to load Replit-specific plugins
// when we're actually running inside Replit. Dynamic imports are wrapped
// to avoid build-time failures when those packages aren't installed.
const plugins = [react(), tailwindcss()];

if (process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined) {
  try {
    const runtimeOverlayMod = await import("@replit/vite-plugin-runtime-error-modal");
    if (runtimeOverlayMod && typeof runtimeOverlayMod.default === "function") {
      plugins.push(runtimeOverlayMod.default());
    }
  } catch (err) {
    // ignore - plugin not available outside Replit
  }

  try {
    const carto = await import("@replit/vite-plugin-cartographer").then((m) =>
      m.cartographer({ root: path.resolve(import.meta.dirname, "..") }),
    );
    plugins.push(carto);
  } catch {}

  try {
    const devBanner = await import("@replit/vite-plugin-dev-banner").then((m) => m.devBanner());
    plugins.push(devBanner);
  } catch {}
}

export default defineConfig({
  base: basePath,
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
