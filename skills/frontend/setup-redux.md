---
name: setup-redux
description: Setup Redux Toolkit with slices, async thunks, and TypeScript for state management
argument-hint: [feature: users|products|auth|general]
---

# Setup Redux Store

Configure Redux Toolkit with modern best practices for centralized state management.

## What This Skill Creates

1. **Store configuration** (`store.ts`)
2. **Feature slice** with reducers and actions
3. **Async thunks** for API calls
4. **TypeScript types** for state and dispatch
5. **Redux DevTools** integration
6. **Custom hooks** (useAppDispatch, useAppSelector)

## Installation

```bash
npm install @reduxjs/toolkit react-redux
npm install --save-dev @types/react-redux
```

## Store Setup

```typescript
// src/store/store.ts
import { configureStore } from '@reduxjs/toolkit';
import usersReducer from './features/users/usersSlice';
import productsReducer from './features/products/productsSlice';
import authReducer from './features/auth/authSlice';

export const store = configureStore({
  reducer: {
    users: usersReducer,
    products: productsReducer,
    auth: authReducer
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types for non-serializable values
        ignoredActions: ['auth/setUser'],
        // Ignore these paths in the state
        ignoredPaths: ['auth.user.createdAt']
      }
    }),
  devTools: process.env.NODE_ENV !== 'production'
});

// Infer types from store
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// src/store/hooks.ts
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from './store';

// Typed hooks
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
```

## Provider Setup

```typescript
// src/index.tsx or src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { store } from './store/store';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
);
```

## Feature Slice Example: Users

```typescript
// src/store/features/users/usersSlice.ts
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { usersApi } from '../../../api/usersApi';

// Types
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
}

interface UsersState {
  users: User[];
  selectedUser: User | null;
  loading: boolean;
  error: string | null;
  page: number;
  totalPages: number;
}

const initialState: UsersState = {
  users: [],
  selectedUser: null,
  loading: false,
  error: null,
  page: 1,
  totalPages: 1
};

// Async Thunks
export const fetchUsers = createAsyncThunk(
  'users/fetchUsers',
  async (page: number = 1, { rejectWithValue }) => {
    try {
      const response = await usersApi.getUsers({ page, pageSize: 20 });
      return response;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch users');
    }
  }
);

export const createUser = createAsyncThunk(
  'users/createUser',
  async (userData: Omit<User, 'id'>, { rejectWithValue }) => {
    try {
      const response = await usersApi.createUser(userData);
      return response;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create user');
    }
  }
);

export const updateUser = createAsyncThunk(
  'users/updateUser',
  async ({ id, updates }: { id: string; updates: Partial<User> }, { rejectWithValue }) => {
    try {
      const response = await usersApi.updateUser(id, updates);
      return response;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update user');
    }
  }
);

export const deleteUser = createAsyncThunk(
  'users/deleteUser',
  async (id: string, { rejectWithValue }) => {
    try {
      await usersApi.deleteUser(id);
      return id;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete user');
    }
  }
);

// Slice
const usersSlice = createSlice({
  name: 'users',
  initialState,
  reducers: {
    setSelectedUser: (state, action: PayloadAction<User | null>) => {
      state.selectedUser = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
    setPage: (state, action: PayloadAction<number>) => {
      state.page = action.payload;
    }
  },
  extraReducers: (builder) => {
    // Fetch Users
    builder
      .addCase(fetchUsers.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.loading = false;
        state.users = action.payload.items;
        state.totalPages = action.payload.totalPages;
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Create User
    builder
      .addCase(createUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createUser.fulfilled, (state, action) => {
        state.loading = false;
        state.users.push(action.payload);
      })
      .addCase(createUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Update User
    builder
      .addCase(updateUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateUser.fulfilled, (state, action) => {
        state.loading = false;
        const index = state.users.findIndex(u => u.id === action.payload.id);
        if (index !== -1) {
          state.users[index] = action.payload;
        }
      })
      .addCase(updateUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Delete User
    builder
      .addCase(deleteUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteUser.fulfilled, (state, action) => {
        state.loading = false;
        state.users = state.users.filter(u => u.id !== action.payload);
      })
      .addCase(deleteUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  }
});

export const { setSelectedUser, clearError, setPage } = usersSlice.actions;
export default usersSlice.reducer;

// Selectors
export const selectAllUsers = (state: RootState) => state.users.users;
export const selectSelectedUser = (state: RootState) => state.users.selectedUser;
export const selectUsersLoading = (state: RootState) => state.users.loading;
export const selectUsersError = (state: RootState) => state.users.error;
export const selectCurrentPage = (state: RootState) => state.users.page;
```

## Using Redux in Components

```typescript
// src/components/UsersList.tsx
import React, { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  fetchUsers,
  deleteUser,
  selectAllUsers,
  selectUsersLoading,
  selectUsersError,
  setSelectedUser
} from '../../store/features/users/usersSlice';

export const UsersList: React.FC = () => {
  const dispatch = useAppDispatch();
  const users = useAppSelector(selectAllUsers);
  const loading = useAppSelector(selectUsersLoading);
  const error = useAppSelector(selectUsersError);

  useEffect(() => {
    dispatch(fetchUsers(1));
  }, [dispatch]);

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this user?')) {
      dispatch(deleteUser(id));
    }
  };

  const handleUserClick = (user: User) => {
    dispatch(setSelectedUser(user));
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h2>Users</h2>
      <ul>
        {users.map(user => (
          <li key={user.id}>
            <span onClick={() => handleUserClick(user)}>{user.name}</span>
            <button onClick={() => handleDelete(user.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
};
```

## Advanced Patterns

### RTK Query (Alternative to Thunks)

```typescript
// src/store/api/usersApi.ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export const usersApi = createApi({
  reducerPath: 'usersApi',
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  tagTypes: ['User'],
  endpoints: (builder) => ({
    getUsers: builder.query<User[], void>({
      query: () => '/users',
      providesTags: ['User']
    }),
    createUser: builder.mutation<User, Omit<User, 'id'>>({
      query: (user) => ({
        url: '/users',
        method: 'POST',
        body: user
      }),
      invalidatesTags: ['User']
    }),
    updateUser: builder.mutation<User, { id: string; updates: Partial<User> }>({
      query: ({ id, updates }) => ({
        url: `/users/${id}`,
        method: 'PUT',
        body: updates
      }),
      invalidatesTags: ['User']
    }),
    deleteUser: builder.mutation<void, string>({
      query: (id) => ({
        url: `/users/${id}`,
        method: 'DELETE'
      }),
      invalidatesTags: ['User']
    })
  })
});

export const {
  useGetUsersQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useDeleteUserMutation
} = usersApi;
```

## Best Practices

1. **Use Redux Toolkit** (not vanilla Redux)
2. **TypeScript everywhere** for type safety
3. **Normalize state** for nested data
4. **Keep state minimal** (don't duplicate server data)
5. **Use selectors** (memoized with reselect)
6. **Async thunks** for API calls
7. **RTK Query** for caching and auto-refetching
8. **Immer** built-in for immutable updates
9. **DevTools** for debugging
10. **Split large slices** into multiple files
