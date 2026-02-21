---
name: implement-routing
description: Implement client-side routing (React Router, Vue Router, Angular Router)
argument-hint: [framework: react|vue|angular]
tags: [frontend, routing, SPA, react-router, navigation, guards]
---

# Client-Side Routing Guide

---

## React Router v6+

```bash
npm install react-router-dom
```

```tsx
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="candidates" element={<CandidateList />} />
          <Route path="candidates/:id" element={<CandidateDetail />} />
          <Route path="settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

// Layout with nested outlet
function Layout() {
  return (<div><Nav /><main><Outlet /></main></div>);
}

// Protected route
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

// Read params
function CandidateDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab') ?? 'overview';
  const navigate = useNavigate();
  return <button onClick={() => navigate('/candidates')}>Back</button>;
}
```

---

## Vue Router

```typescript
const routes = [
  { path: '/', component: () => import('./pages/Dashboard.vue') },
  { path: '/candidates', component: () => import('./pages/Candidates.vue') },
  { path: '/candidates/:id', component: () => import('./pages/CandidateDetail.vue'), props: true },
  { path: '/admin', component: () => import('./pages/Admin.vue'), meta: { requiresAuth: true } },
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to, from) => {
  if (to.meta.requiresAuth && !isAuthenticated()) return '/login';
});
```

---

## Angular Router

```typescript
const routes: Routes = [
  { path: '', component: DashboardComponent },
  { path: 'candidates', loadComponent: () => import('./candidates.component').then(m => m.CandidatesComponent) },
  { path: 'candidates/:id', component: CandidateDetailComponent },
  { path: 'admin', canActivate: [authGuard], loadChildren: () => import('./admin/admin.routes') },
  { path: '**', component: NotFoundComponent },
];
```

---

## Best Practices

| Practice | Why |
|----------|-----|
| Lazy-load route components | Smaller initial bundle |
| Use nested routes for layouts | Shared UI without re-renders |
| Implement auth guards | Prevent unauthorized access |
| Handle 404 with catch-all | Better UX for invalid URLs |
| Use `replace` for redirects | Clean browser history |
