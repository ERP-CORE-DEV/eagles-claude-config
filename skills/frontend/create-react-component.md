---
name: create-react-component
description: Create a React component with TypeScript, hooks, props validation, and styling
argument-hint: [type: functional|form|table|modal|layout] [styling: css-modules|styled-components|tailwind]
---

# Create React Component

Generate modern React 18 functional components with TypeScript and best practices.

## Component Types

### Functional Component (Display)
- Receives props, renders UI
- No state or side effects
- Pure, memoizable

### Form Component
- Form state management
- Input validation
- Submit handling
- Error display

### Table/List Component
- Data display
- Sorting, filtering, pagination
- Row selection
- Export functionality

### Modal/Dialog Component
- Overlay UI
- Open/close state
- Backdrop click handling
- Keyboard (Escape) handling

### Layout Component
- Page structure
- Responsive design
- Navigation, sidebars, footers

## Generated Files

1. **Component file** (`ComponentName.tsx`)
2. **Styles** (CSS Module, Styled Components, or Tailwind)
3. **Types** (Props interface, internal types)
4. **Tests** (`ComponentName.test.tsx`)
5. **Storybook story** (optional)

## Example: Functional Component

```typescript
// UserCard.tsx
import React from 'react';
import styles from './UserCard.module.css';

interface UserCardProps {
  /** User's full name */
  name: string;
  /** User's email address */
  email: string;
  /** User's role in the system */
  role: 'admin' | 'user' | 'guest';
  /** Avatar image URL */
  avatarUrl?: string;
  /** Click handler for card */
  onClick?: () => void;
  /** Additional CSS class */
  className?: string;
}

export const UserCard: React.FC<UserCardProps> = ({
  name,
  email,
  role,
  avatarUrl,
  onClick,
  className
}) => {
  const roleColor = {
    admin: styles.roleAdmin,
    user: styles.roleUser,
    guest: styles.roleGuest
  }[role];

  return (
    <div
      className={`${styles.card} ${className ?? ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {avatarUrl && (
        <img
          src={avatarUrl}
          alt={`${name}'s avatar`}
          className={styles.avatar}
        />
      )}
      <div className={styles.info}>
        <h3 className={styles.name}>{name}</h3>
        <p className={styles.email}>{email}</p>
        <span className={`${styles.role} ${roleColor}`}>
          {role.toUpperCase()}
        </span>
      </div>
    </div>
  );
};

// UserCard.module.css
.card {
  display: flex;
  gap: 1rem;
  padding: 1.5rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  transition: all 0.2s;
}

.card:hover {
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  cursor: pointer;
}

.avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
}

.name {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
}

.email {
  margin: 0.25rem 0;
  color: #6b7280;
}

.role {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  border-radius: 0.25rem;
}

.roleAdmin { background: #dbeafe; color: #1e40af; }
.roleUser { background: #d1fae5; color: #065f46; }
.roleGuest { background: #f3f4f6; color: #374151; }
```

## Example: Form Component with Validation

```typescript
// CreateUserForm.tsx
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const userSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  role: z.enum(['admin', 'user', 'guest']),
  age: z.number().min(18, 'Must be at least 18 years old').max(120)
});

type UserFormData = z.infer<typeof userSchema>;

interface CreateUserFormProps {
  onSubmit: (data: UserFormData) => Promise<void>;
  onCancel?: () => void;
  initialData?: Partial<UserFormData>;
  isLoading?: boolean;
}

export const CreateUserForm: React.FC<CreateUserFormProps> = ({
  onSubmit,
  onCancel,
  initialData,
  isLoading = false
}) => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    defaultValues: initialData
  });

  const onSubmitHandler = async (data: UserFormData) => {
    try {
      await onSubmit(data);
    } catch (error) {
      console.error('Form submission error:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmitHandler)} className="space-y-4">
      <div>
        <label htmlFor="firstName" className="block text-sm font-medium">
          First Name
        </label>
        <input
          id="firstName"
          type="text"
          {...register('firstName')}
          className="mt-1 block w-full rounded border-gray-300"
          disabled={isSubmitting || isLoading}
        />
        {errors.firstName && (
          <p className="mt-1 text-sm text-red-600">{errors.firstName.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="lastName" className="block text-sm font-medium">
          Last Name
        </label>
        <input
          id="lastName"
          type="text"
          {...register('lastName')}
          className="mt-1 block w-full rounded border-gray-300"
          disabled={isSubmitting || isLoading}
        />
        {errors.lastName && (
          <p className="mt-1 text-sm text-red-600">{errors.lastName.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          {...register('email')}
          className="mt-1 block w-full rounded border-gray-300"
          disabled={isSubmitting || isLoading}
        />
        {errors.email && (
          <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="role" className="block text-sm font-medium">
          Role
        </label>
        <select
          id="role"
          {...register('role')}
          className="mt-1 block w-full rounded border-gray-300"
          disabled={isSubmitting || isLoading}
        >
          <option value="">Select a role</option>
          <option value="admin">Admin</option>
          <option value="user">User</option>
          <option value="guest">Guest</option>
        </select>
        {errors.role && (
          <p className="mt-1 text-sm text-red-600">{errors.role.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="age" className="block text-sm font-medium">
          Age
        </label>
        <input
          id="age"
          type="number"
          {...register('age', { valueAsNumber: true })}
          className="mt-1 block w-full rounded border-gray-300"
          disabled={isSubmitting || isLoading}
        />
        {errors.age && (
          <p className="mt-1 text-sm text-red-600">{errors.age.message}</p>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isSubmitting || isLoading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Saving...' : 'Save User'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting || isLoading}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
};
```

## Example: Table Component with Sorting

```typescript
// UserTable.tsx
import React, { useState, useMemo } from 'react';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: Date;
}

interface UserTableProps {
  users: User[];
  onUserClick?: (user: User) => void;
  onDelete?: (userId: string) => void;
  isLoading?: boolean;
}

type SortField = keyof User;
type SortDirection = 'asc' | 'desc';

export const UserTable: React.FC<UserTableProps> = ({
  users,
  onUserClick,
  onDelete,
  isLoading = false
}) => {
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [users, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          <th
            onClick={() => handleSort('name')}
            className="px-6 py-3 text-left cursor-pointer hover:bg-gray-100"
          >
            Name {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
          </th>
          <th
            onClick={() => handleSort('email')}
            className="px-6 py-3 text-left cursor-pointer hover:bg-gray-100"
          >
            Email {sortField === 'email' && (sortDirection === 'asc' ? '↑' : '↓')}
          </th>
          <th className="px-6 py-3 text-left">Role</th>
          <th className="px-6 py-3 text-right">Actions</th>
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {sortedUsers.map(user => (
          <tr
            key={user.id}
            onClick={() => onUserClick?.(user)}
            className="hover:bg-gray-50 cursor-pointer"
          >
            <td className="px-6 py-4 whitespace-nowrap">{user.name}</td>
            <td className="px-6 py-4 whitespace-nowrap">{user.email}</td>
            <td className="px-6 py-4 whitespace-nowrap">{user.role}</td>
            <td className="px-6 py-4 whitespace-nowrap text-right">
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(user.id);
                  }}
                  className="text-red-600 hover:text-red-900"
                >
                  Delete
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
```

## Best Practices

1. **TypeScript**: Always use TypeScript for type safety
2. **Props Interface**: Document props with JSDoc comments
3. **Accessibility**: Use semantic HTML, ARIA labels, keyboard navigation
4. **Performance**: Use React.memo for expensive components
5. **Hooks**: Follow Rules of Hooks (top level, consistent order)
6. **Error Boundaries**: Wrap components to catch errors
7. **Testing**: Unit tests with React Testing Library
8. **Styling**: CSS Modules for isolation, or Tailwind for utility-first
9. **Naming**: PascalCase for components, camelCase for functions
10. **File Structure**: One component per file, colocate tests and styles
