# karthikbadam.github.io

This repository contains the source code for my personal website and blog, hosted at https://karthikbadam.github.io.

## Built With

- Vite (https://vitejs.dev/)
- React 19 + TypeScript
- Chakra UI (https://chakra-ui.com/)
- MDX for writing blog posts
- D3 & visx for data visualizations
- Framer Motion for animations
- React Router DOM for client-side routing (using HashRouter for GitHub Pages compatibility)

## Project Structure

- **src/**
  - **pages/**: React components for each route (Home, About, Blog, Publications)
  - **components/**: Reusable UI components
  - **content/**: MDX blog posts
  - **data/**: JSON data for posts, publications, awards, and featured projects
  - **styles/**: Global styles and theme configuration
  - **App.tsx**, **main.tsx**: Application entry points
- **public/**: Static assets (favicon, images)
  - **404.html**: Redirect script to handle direct URL access in GitHub Pages
- **index.html**: Main HTML template
- **vite.config.ts**: Vite configuration for MDX, syntax highlighting, and plugins
- **eslint.config.js**: ESLint configuration with plugins and rules
- **tsconfig.app.json**, **tsconfig.node.json**: TypeScript configurations

## Routing

This project uses React Router's `HashRouter` instead of `BrowserRouter` to ensure compatibility with GitHub Pages. The HashRouter approach uses URL hashes (e.g., `/#/about` instead of `/about`) which prevents 404 errors on GitHub Pages when users access routes directly or refresh the page.

A `404.html` redirect script is also included to handle cases where users might access direct URLs, redirecting them to the appropriate hash route.

## Scripts

- `npm run dev`: Start development server at http://localhost:5173
- `npm run build`: Build for production into `dist/`
- `npm run preview`: Preview the production build locally
- `npm run lint`: Run ESLint to check code quality

## Getting Started

### Prerequisites

- Node.js v18 or higher
- npm (Node Package Manager)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/karthikbadam/karthikbadam.github.io.git
   cd karthikbadam.github.io
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
   If you encounter errors related to peer dependencies, try:
   ```bash
   npm install --legacy-peer-deps
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

## Deployment

This site is deployed to GitHub Pages. To build and deploy manually:

```bash
npm run build
# Deploy the contents of the `dist/` directory to the `gh-pages` branch
```

You can also set up a GitHub Action to automate deployment on push to `main`.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
