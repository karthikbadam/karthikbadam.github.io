/// <reference types="vite/client" />
/// <reference types="mdx" />

interface Window {
  gtag: (...args: unknown[]) => void;
  dataLayer: unknown[];
}
