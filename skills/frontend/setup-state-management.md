---
name: setup-state-management
description: Setup state management (Redux Toolkit, Zustand, Pinia, Context)
argument-hint: [library: redux|zustand|pinia|context|jotai]
tags: [frontend, state, Redux, Zustand, Pinia, React, Vue]
---

# State Management Guide

Choose based on complexity: Context for simple, Zustand/Jotai for medium, Redux Toolkit for complex.

---

## Redux Toolkit (Complex Apps)

```bash
npm install @reduxjs/toolkit react-redux
```

```typescript
// store/candidateSlice.ts
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

export const fetchCandidates = createAsyncThunk('candidates/fetch',
  async (params: { page: number; pageSize: number }) => {
    const res = await api.get('/api/candidates', { params });
    return res.data;
  });

const candidateSlice = createSlice({
  name: 'candidates',
  initialState: { items: [], loading: false, error: null, total: 0 },
  reducers: {
    clearError: (state) => { state.error = null; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCandidates.pending, (state) => { state.loading = true; })
      .addCase(fetchCandidates.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.data;
        state.total = action.payload.pagination.totalItems;
      })
      .addCase(fetchCandidates.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Error';
      });
  },
});

// store/index.ts
import { configureStore } from '@reduxjs/toolkit';
export const store = configureStore({ reducer: { candidates: candidateSlice.reducer } });
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

---

## Zustand (Lightweight)

```bash
npm install zustand
```

```typescript
import { create } from 'zustand';

interface CandidateStore {
  candidates: Candidate[];
  loading: boolean;
  fetchCandidates: () => Promise<void>;
  addCandidate: (c: Candidate) => void;
}

const useCandidateStore = create<CandidateStore>((set) => ({
  candidates: [],
  loading: false,
  fetchCandidates: async () => {
    set({ loading: true });
    const res = await api.get('/api/candidates');
    set({ candidates: res.data.data, loading: false });
  },
  addCandidate: (c) => set((state) => ({ candidates: [...state.candidates, c] })),
}));

// Usage
function CandidateList() {
  const { candidates, loading, fetchCandidates } = useCandidateStore();
  useEffect(() => { fetchCandidates(); }, []);
}
```

---

## Vue Pinia

```typescript
export const useCandidateStore = defineStore('candidates', () => {
  const items = ref<Candidate[]>([]);
  const loading = ref(false);

  async function fetchAll() {
    loading.value = true;
    const res = await api.get('/api/candidates');
    items.value = res.data.data;
    loading.value = false;
  }

  return { items, loading, fetchAll };
});
```

---

## React Context (Simple State)

```tsx
const AuthContext = createContext<{ user: User | null; login: (creds: Credentials) => Promise<void> } | null>(null);

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const login = async (creds: Credentials) => { const u = await api.login(creds); setUser(u); };
  return <AuthContext.Provider value={{ user, login }}>{children}</AuthContext.Provider>;
}

function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

---

## Decision Matrix

| Criteria | Context | Zustand | Redux Toolkit | Pinia |
|----------|---------|---------|---------------|-------|
| Bundle size | 0KB | ~1KB | ~11KB | ~2KB |
| Boilerplate | Minimal | Low | Medium | Low |
| DevTools | No | Yes | Excellent | Yes |
| Async support | Manual | Built-in | createAsyncThunk | Built-in |
| Best for | Auth, theme | Medium apps | Large apps | Vue apps |
