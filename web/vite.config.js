import { defineConfig } from "vite";

// If deploying to GitHub Pages under a repo subpath, set VITE_BASE=/repo-name/
export default defineConfig({
    base: process.env.VITE_BASE ?? "./",
    build: {
        target: "es2020",
        outDir: "dist",
    },
});
