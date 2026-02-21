---
name: implement-lazy-loading
description: Implement lazy loading for routes and components
argument-hint: [framework: react|vue|angular]
tags: [frontend, performance, lazy-loading, code-splitting, React, Suspense]
---

# Lazy Loading & Code Splitting Guide

Lazy loading defers loading of non-critical resources until they're needed, reducing initial bundle size.

---

## React

### Route-Based Splitting

```tsx
import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Candidates = lazy(() => import('./pages/Candidates'));
const Settings = lazy(() => import('./pages/Settings'));

function App() {
  return (
    <Suspense fallback={<div>Chargement...</div>}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/candidates" element={<Candidates />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Suspense>
  );
}
```

### Component-Based Splitting

```tsx
const HeavyChart = lazy(() => import('./components/HeavyChart'));

function Dashboard() {
  const [showChart, setShowChart] = useState(false);
  return (
    <div>
      <button onClick={() => setShowChart(true)}>Show Chart</button>
      {showChart && (
        <Suspense fallback={<Skeleton />}>
          <HeavyChart data={data} />
        </Suspense>
      )}
    </div>
  );
}
```

### Named Exports

```tsx
// Must use default export OR wrap:
const CandidateForm = lazy(() =>
  import('./components/CandidateForm').then(m => ({ default: m.CandidateForm }))
);
```

---

## Vue 3

```typescript
import { defineAsyncComponent } from 'vue';
const AsyncChart = defineAsyncComponent({
  loader: () => import('./HeavyChart.vue'),
  loadingComponent: LoadingSpinner,
  errorComponent: ErrorDisplay,
  delay: 200,
  timeout: 30000,
});

// Router
const routes = [
  { path: '/candidates', component: () => import('./pages/Candidates.vue') },
  { path: '/settings', component: () => import('./pages/Settings.vue') },
];
```

---

## Angular

```typescript
const routes: Routes = [
  { path: 'candidates', loadComponent: () => import('./candidates.component').then(m => m.CandidatesComponent) },
  { path: 'admin', loadChildren: () => import('./admin/admin.routes').then(m => m.ADMIN_ROUTES) },
];
```

---

## Image Lazy Loading

```html
<img src="placeholder.jpg" data-src="actual.jpg" loading="lazy" alt="Photo" />
```

```tsx
// Intersection Observer
function LazyImage({ src, alt }: { src: string; alt: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setLoaded(true); observer.disconnect(); }
    }, { rootMargin: '200px' });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return <img ref={ref} src={loaded ? src : undefined} alt={alt} loading="lazy" />;
}
```

---

## Preloading Critical Routes

```tsx
// Preload on hover
<Link to="/candidates" onMouseEnter={() => import('./pages/Candidates')}>
  Candidates
</Link>

// Preload after initial render
useEffect(() => {
  const timer = setTimeout(() => { import('./pages/Settings'); }, 3000);
  return () => clearTimeout(timer);
}, []);
```
