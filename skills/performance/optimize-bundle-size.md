---
name: optimize-bundle-size
description: Reduce frontend bundle size through code splitting, tree shaking, and lazy loading
argument-hint: [framework: react|vue|angular]
---

# Optimize Frontend Bundle Size

Systematically reduce JavaScript, CSS, and asset bundle sizes to improve page load performance, reduce bandwidth costs, and meet Core Web Vitals targets.

## When to Use

- **Initial bundle exceeds 200 KB gzipped** and Lighthouse flags "Reduce unused JavaScript"
- **Time to Interactive (TTI) is above 3.5 seconds** on a 4G connection
- **Adding a new dependency** that increases bundle size by more than 20 KB
- **Preparing for production launch** and need to audit all shipped code
- **CI pipeline reports bundle size regression** beyond the configured budget
- **Users on low-bandwidth or mobile networks** report slow page loads
- **Migrating bundlers** (e.g., webpack to Vite) and want to verify no regressions

## Analysis Tools

Before optimizing, measure what you have:

```bash
# Visualize webpack bundle composition
npx webpack-bundle-analyzer dist/stats.json

# Analyze with source maps (works with any bundler)
npx source-map-explorer dist/**/*.js

# Find unused dependencies in package.json
npx depcheck

# Find unused exports in TypeScript
npx ts-prune

# Check a package size before installing
# Visit https://bundlephobia.com/package/<name>
```

## Implementation: React (Webpack)

### Route-Level Code Splitting

```tsx
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

const HomePage = lazy(() => import('./pages/HomePage'));
const ProductsPage = lazy(() => import('./pages/ProductsPage'));
const AdminPage = lazy(() => import(
  /* webpackChunkName: "admin" */
  /* webpackPrefetch: true */
  './pages/AdminPage'
));

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div>Loading...</div>}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
```

### Component-Level Lazy Loading

```tsx
const HeavyChart = lazy(() => import('./components/HeavyChart'));

function Dashboard() {
  const [showChart, setShowChart] = useState(false);

  return (
    <div>
      <button onClick={() => setShowChart(true)}>Show Analytics</button>
      {showChart && (
        <Suspense fallback={<Skeleton height={400} />}>
          <HeavyChart data={data} />
        </Suspense>
      )}
    </div>
  );
}
```

### Webpack Tree Shaking and Split Chunks Configuration

```javascript
// webpack.config.js
const CompressionPlugin = require('compression-webpack-plugin');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  mode: 'production',
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: true,
            drop_debugger: true,
            pure_funcs: ['console.log', 'console.info'],
          },
          mangle: { safari10: true },
        },
      }),
    ],
    usedExports: true, // enable tree shaking
    sideEffects: true, // respect package.json sideEffects field
    splitChunks: {
      chunks: 'all',
      maxInitialRequests: 25,
      minSize: 20000,
      cacheGroups: {
        reactVendor: {
          test: /[\\/]node_modules[\\/](react|react-dom|react-router-dom)[\\/]/,
          name: 'react-vendor',
          priority: 20,
        },
        uiVendor: {
          test: /[\\/]node_modules[\\/](@mui|antd|@ant-design)[\\/]/,
          name: 'ui-vendor',
          priority: 15,
        },
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          priority: 10,
        },
        common: {
          minChunks: 2,
          priority: 5,
          reuseExistingChunk: true,
        },
      },
    },
  },
  plugins: [
    new CompressionPlugin({
      algorithm: 'gzip',
      test: /\.(js|css|html|svg)$/,
      threshold: 10240,
      minRatio: 0.8,
    }),
    // Only include in analysis builds
    ...(process.env.ANALYZE ? [new BundleAnalyzerPlugin()] : []),
  ],
};
```

Ensure your `package.json` declares side-effect-free modules:

```json
{
  "sideEffects": [
    "*.css",
    "*.scss",
    "./src/polyfills.ts"
  ]
}
```

## Implementation: React (Vite)

### Vite Configuration with Manual Chunks and Rollup Visualizer

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import viteCompression from 'vite-plugin-compression';
import viteImagemin from 'vite-plugin-imagemin';

export default defineConfig({
  plugins: [
    react(),
    viteCompression({ algorithm: 'brotliCompress' }),
    viteImagemin({
      gifsicle: { optimizationLevel: 3 },
      mozjpeg: { quality: 75 },
      pngquant: { quality: [0.65, 0.8] },
      svgo: { plugins: [{ name: 'removeViewBox', active: false }] },
    }),
    visualizer({
      filename: 'dist/bundle-report.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  build: {
    target: 'es2020',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react-vendor';
            }
            if (id.includes('@mui') || id.includes('antd')) {
              return 'ui-vendor';
            }
            if (id.includes('lodash') || id.includes('date-fns')) {
              return 'utils';
            }
            return 'vendor';
          }
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
});
```

## Implementation: Vue

### Route-Level Code Splitting with Vue Router

```typescript
// router/index.ts
import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: () => import(
        /* webpackChunkName: "home" */
        '../views/HomeView.vue'
      ),
    },
    {
      path: '/dashboard',
      component: () => import(
        /* webpackChunkName: "dashboard" */
        '../views/DashboardView.vue'
      ),
    },
    {
      path: '/admin',
      component: () => import(
        /* webpackChunkName: "admin" */
        '../views/AdminView.vue'
      ),
    },
  ],
});

export default router;
```

### Async Components in Vue

```vue
<script setup lang="ts">
import { defineAsyncComponent, ref } from 'vue';

const HeavyChart = defineAsyncComponent({
  loader: () => import('./HeavyChart.vue'),
  loadingComponent: () => import('./ChartSkeleton.vue'),
  delay: 200,       // ms before showing loading component
  timeout: 10000,   // ms before showing error
});

const showChart = ref(false);
</script>

<template>
  <button @click="showChart = true">Show Analytics</button>
  <HeavyChart v-if="showChart" :data="data" />
</template>
```

### Vite Configuration for Vue

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';
import { AntDesignVueResolver } from 'unplugin-vue-components/resolvers';

export default defineConfig({
  plugins: [
    vue(),
    // Auto-import only the components actually used (tree shaking UI libs)
    Components({
      resolvers: [AntDesignVueResolver({ importStyle: 'less' })],
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
        },
      },
    },
  },
});
```

## Implementation: Angular

### Lazy-Loaded Feature Modules

```typescript
// app-routing.module.ts
const routes: Routes = [
  {
    path: '',
    loadChildren: () =>
      import('./features/home/home.module').then(m => m.HomeModule),
  },
  {
    path: 'dashboard',
    loadChildren: () =>
      import('./features/dashboard/dashboard.module').then(m => m.DashboardModule),
  },
  {
    path: 'admin',
    loadChildren: () =>
      import('./features/admin/admin.module').then(m => m.AdminModule),
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
```

### Deferred Views (Angular 17+)

```html
<!-- template.html -->
@defer (on viewport) {
  <app-heavy-chart [data]="chartData" />
} @placeholder {
  <div class="chart-skeleton">Loading chart...</div>
} @loading (minimum 300ms) {
  <app-spinner />
}

@defer (on interaction) {
  <app-comments [postId]="post.id" />
} @placeholder {
  <button>Load Comments</button>
}
```

### Angular Build Budgets Configuration

```json
// angular.json (under architect > build > configurations > production)
{
  "budgets": [
    {
      "type": "initial",
      "maximumWarning": "300kb",
      "maximumError": "500kb"
    },
    {
      "type": "anyComponentStyle",
      "maximumWarning": "4kb",
      "maximumError": "8kb"
    }
  ],
  "optimization": true,
  "outputHashing": "all",
  "sourceMap": false,
  "namedChunks": false,
  "extractLicenses": true
}
```

### Angular Custom Webpack for Bundle Analysis

```javascript
// extra-webpack.config.js (used with @angular-builders/custom-webpack)
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

module.exports = {
  plugins: [
    ...(process.env.ANALYZE ? [new BundleAnalyzerPlugin()] : []),
  ],
};
```

## Tree Shaking: Import Patterns That Matter

```typescript
// --- BAD: pulls in entire library ---
import _ from 'lodash';              // ~71 KB
import * as MUI from '@mui/material'; // ~500 KB
import moment from 'moment';          // ~288 KB (with locales)

// --- GOOD: cherry-pick imports ---
import debounce from 'lodash-es/debounce';    // ~2 KB (use lodash-es, not lodash)
import { Button, TextField } from '@mui/material'; // ~20 KB (bundler eliminates rest)
import { format } from 'date-fns';            // ~13 KB tree-shakeable

// --- GOOD: dynamic import for occasional use ---
async function handleExport() {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  // ... export logic
}

// --- GOOD: conditional polyfill ---
if (!('IntersectionObserver' in window)) {
  await import('intersection-observer');
}
```

## Image Optimization

```bash
# Install sharp-based optimization for Vite
npm install -D vite-plugin-imagemin

# Convert images to WebP/AVIF at build time
npx sharp-cli --input src/assets/*.png --output dist/assets/ --format webp --quality 80
```

```tsx
// Responsive images with modern formats
function OptimizedImage({ src, alt }: { src: string; alt: string }) {
  return (
    <picture>
      <source srcSet={`${src}.avif`} type="image/avif" />
      <source srcSet={`${src}.webp`} type="image/webp" />
      <img
        src={`${src}.jpg`}
        alt={alt}
        loading="lazy"
        decoding="async"
        width={800}
        height={600}
      />
    </picture>
  );
}

// Vite: query-string transforms via vite-imagetools
import heroImage from './hero.jpg?w=800&format=webp&quality=80';
```

## Font Subsetting

```bash
# Install pyftsubset (part of fonttools)
pip install fonttools brotli

# Subset to Latin characters only (~70% size reduction)
pyftsubset MyFont.ttf \
  --output-file=MyFont-subset.woff2 \
  --flavor=woff2 \
  --layout-features='kern,liga,calt' \
  --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"

# For French HR applications, include extended Latin for accented characters
pyftsubset MyFont.ttf \
  --output-file=MyFont-fr-subset.woff2 \
  --flavor=woff2 \
  --unicodes="U+0000-024F,U+1E00-1EFF,U+2000-206F,U+20AC,U+2122"
```

```html
<!-- Preload critical fonts to avoid FOIT -->
<link rel="preload" href="/fonts/main-subset.woff2" as="font" type="font/woff2" crossorigin />
```

```css
@font-face {
  font-family: 'MainFont';
  src: url('/fonts/main-subset.woff2') format('woff2');
  font-display: swap; /* show fallback text immediately, swap when font loads */
  font-weight: 400;
  unicode-range: U+0000-024F; /* declare range to avoid unnecessary downloads */
}
```

## CSS Optimization

```javascript
// Tailwind CSS: purge unused classes automatically
// tailwind.config.js
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx,vue,html}'],
};

// PostCSS: minify and remove duplicates
// postcss.config.js
module.exports = {
  plugins: [
    require('autoprefixer'),
    require('cssnano')({
      preset: ['default', { discardComments: { removeAll: true } }],
    }),
  ],
};
```

```bash
# Audit unused CSS in any project
npx purgecss --css dist/**/*.css --content dist/**/*.html dist/**/*.js --output dist/purged/
```

## Bundle Size Budgets in CI

```yaml
# .github/workflows/bundle-check.yml
name: Bundle Size Check
on: [pull_request]

jobs:
  size:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run build
      - uses: andresz1/size-limit-action@v1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

```json
// package.json -- size-limit config
{
  "size-limit": [
    { "path": "dist/assets/*.js", "limit": "200 KB", "gzip": true },
    { "path": "dist/assets/*.css", "limit": "30 KB", "gzip": true }
  ]
}
```

## Target Sizes

| Category     | Budget (gzipped) | Notes                           |
|--------------|------------------|---------------------------------|
| Initial JS   | < 150 KB         | Critical for First Contentful Paint |
| Total JS     | < 400 KB         | All chunks combined             |
| CSS          | < 40 KB          | Critical CSS should be inlined  |
| Vendor chunk | < 120 KB         | Third-party libraries           |
| Single route | < 50 KB          | Per lazy-loaded route chunk     |
| Images       | < 200 KB each    | Use WebP/AVIF, responsive sizes |
| Fonts        | < 50 KB per face | WOFF2 subsetted                 |

## Best Practices

1. **Measure before optimizing.** Run `webpack-bundle-analyzer` or `rollup-plugin-visualizer` first. Target the largest chunks; do not micro-optimize 2 KB modules.
2. **Use ES module versions of libraries** (`lodash-es` instead of `lodash`, `date-fns` instead of `moment`). ES modules enable tree shaking; CommonJS modules do not.
3. **Set `sideEffects: false`** in your `package.json` if your code has no import side effects. This tells bundlers they can safely remove unused exports.
4. **Prefer native APIs over libraries.** `fetch` over `axios`, `Intl.DateTimeFormat` over `moment`, `structuredClone` over `lodash.cloneDeep`, CSS Grid/Flexbox over layout libraries.
5. **Lazy-load everything below the fold.** Routes, heavy components, images, and even CSS for non-critical sections.
6. **Serve Brotli over Gzip.** Brotli achieves 15-20% better compression on text assets. Configure your CDN or reverse proxy accordingly.
7. **Pin dependency versions and audit regularly.** A minor version bump in a transitive dependency can add unexpected weight. Use `npm ls --all` and `depcheck` periodically.
8. **Externalize large shared dependencies** when using micro-frontends. React, Vue, or Angular should be loaded once via a CDN or shared module federation, not bundled per app.
9. **Use `import()` with magic comments** (`webpackChunkName`, `webpackPrefetch`, `webpackPreload`) to control chunk naming and browser preloading hints.
10. **Automate bundle budgets in CI.** Use `size-limit`, Angular budgets, or Lighthouse CI so regressions are caught before merge.

## Common Pitfalls

1. **Barrel file re-exports defeat tree shaking.** An `index.ts` that re-exports everything from a folder forces bundlers to include all modules even when only one is imported. Import directly from the source file instead.
   ```typescript
   // BAD: import { Button } from './components';  (if index.ts re-exports 50 components)
   // GOOD: import { Button } from './components/Button';
   ```

2. **Dynamic expressions in `import()` create massive chunks.** `import('./locales/${lang}.json')` may bundle every file in `./locales/`. Use explicit mappings or limit the glob pattern.

3. **CSS-in-JS runtime cost.** Libraries like `styled-components` and `emotion` add ~12-15 KB of runtime. For large apps, consider zero-runtime alternatives like `vanilla-extract`, `linaria`, or Tailwind CSS.

4. **Forgetting to analyze after dependency upgrades.** A `npm update` can silently increase your bundle. Always re-run the analyzer after major dependency changes.

5. **Source maps shipped to production.** Source maps are useful for debugging but can expose your source code and add significant file size. Ensure `sourceMap: false` or use hidden source maps uploaded only to your error tracking service.

6. **Duplicated dependencies in the bundle.** Two different versions of the same library (e.g., `lodash` 4.17.20 and 4.17.21) both end up in the bundle. Run `npm dedupe` and check with `npm ls <package>`.

7. **Not setting `resolve.extensions` correctly.** Overly broad extensions lists slow down resolution and can pull in unintended files. Keep the list minimal: `['.ts', '.tsx', '.js', '.jsx']`.

8. **Importing development-only code in production.** Guard dev tools and mocks behind `process.env.NODE_ENV` checks so bundlers can dead-code-eliminate them.
   ```typescript
   if (process.env.NODE_ENV === 'development') {
     const { worker } = await import('./mocks/browser');
     worker.start();
   }
   ```

9. **Polyfills for features your target browsers already support.** Check your `browserslist` config and use `@babel/preset-env` with `useBuiltIns: 'usage'` to include only the polyfills you actually need.

10. **Not leveraging HTTP/2 multiplexing.** With HTTP/2, many small chunks are often faster than a few large ones. Do not over-consolidate chunks just to reduce request count if your server supports HTTP/2.

## Checklist

- [ ] Run bundle analyzer and identify the three largest chunks
- [ ] Code split all routes (lazy load with `React.lazy`, Vue async routes, or Angular `loadChildren`)
- [ ] Lazy load heavy components that are below the fold or triggered by user action
- [ ] Use dynamic `import()` for large libraries used only in specific flows
- [ ] Replace heavy libraries with lighter or native alternatives
- [ ] Verify tree shaking works: check `sideEffects` field and use ES module imports
- [ ] Enable Brotli/Gzip compression at the server or CDN level
- [ ] Optimize images (WebP/AVIF, responsive sizes, lazy loading)
- [ ] Subset and preload fonts (WOFF2, `font-display: swap`)
- [ ] Purge unused CSS (Tailwind content config, PurgeCSS, or cssnano)
- [ ] Remove `console.log` and `debugger` statements in production builds
- [ ] Set up bundle size budgets in CI (size-limit, Angular budgets, or Lighthouse CI)
- [ ] Run `npm dedupe` and `depcheck` to eliminate duplicates and unused packages
- [ ] Verify source maps are not shipped to production users
