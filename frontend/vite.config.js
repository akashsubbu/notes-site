import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves project sites at https://<user>.github.io/<repo>/ —
// everything has to be built with that subpath as the base, or assets will
// 404. Set BASE_PATH to "/<repo-name>/" (with slashes on both ends) when
// building for GitHub Pages; the deploy workflow sets this automatically.
// For a custom domain or any other host, leave it as "/".
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH || "/",
});
