import mdx from "@mdx-js/rollup";
import react from "@vitejs/plugin-react";
import rehypePrism from "rehype-prism-plus";
import rehypeSlug from "rehype-slug";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";



// https://vite.dev/config/
export default defineConfig({
  base: "/",
  plugins: [
    react(), tsconfigPaths(),
    mdx({
      remarkPlugins: [remarkGfm, remarkFrontmatter],
      rehypePlugins: [rehypeSlug, [rehypePrism, { ignoreMissing: true }]],
    }),
  ],
  optimizeDeps: {
    exclude: ["@duckdb/duckdb-wasm"],
  },
});
