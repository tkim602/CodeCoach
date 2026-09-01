import { rmSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/CodeCoach/",
  plugins: [
    react(),
    {
      name: "clean-generated-pages",
      apply: "build",
      buildStart() {
        const generatedPaths = [
          "docs/assets",
          "docs/fonts",
          "docs/ko",
          "docs/index.html",
          "docs/site.css",
          "docs/codecoach-demo-poster.png",
          "docs/privacy-policy.html",
          "docs/robots.txt",
          "docs/sitemap.xml",
          "docs/google554fd5ed1b7980ea.html",
        ];

        generatedPaths.forEach((path) => {
          rmSync(resolve(import.meta.dirname, path), { force: true, recursive: true });
        });
      },
    },
  ],
  publicDir: "landing/public",
  build: {
    outDir: "docs",
    emptyOutDir: false,
    rollupOptions: {
      input: {
        en: resolve(import.meta.dirname, "index.html"),
        ko: resolve(import.meta.dirname, "ko/index.html"),
      },
    },
  },
  test: {
    environment: "jsdom",
    css: true,
    globals: true,
  },
});
