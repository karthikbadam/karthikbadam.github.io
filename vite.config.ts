import mdx from "@mdx-js/rollup";
import rehypePrism from "rehype-prism-plus";
import rehypeSlug from "rehype-slug";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [
    mdx({
      remarkPlugins: [
        remarkGfm,
        remarkFrontmatter,
      ],
      rehypePlugins: [rehypeSlug, [rehypePrism, { ignoreMissing: true }]],
    }),
  ],
});
