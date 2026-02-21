---
name: create-snapshot-tests
description: Create snapshot tests for UI components
argument-hint: [framework: jest|vitest|storybook]
tags: [testing, snapshots, UI, jest, regression, components]
---

# Snapshot Testing Guide

Snapshot tests capture rendered output and alert you when it changes unexpectedly.

---

## Jest Snapshots

```tsx
import { render } from '@testing-library/react';

test('CandidateCard renders correctly', () => {
  const { container } = render(
    <CandidateCard candidate={{ id: '1', name: 'Jean Dupont', skills: ['React', 'TypeScript'] }} />
  );
  expect(container).toMatchSnapshot();
});

// Inline snapshot (stored in test file)
test('Badge renders status', () => {
  const { container } = render(<Badge status="active" />);
  expect(container.innerHTML).toMatchInlineSnapshot(`"<span class=\"badge active\">Active</span>"`);
});
```

### Updating Snapshots

```bash
# When changes are intentional
jest --updateSnapshot
# or
jest -u
```

---

## Vitest

```typescript
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/vue';
import CandidateCard from './CandidateCard.vue';

it('matches snapshot', () => {
  const { html } = render(CandidateCard, { props: { name: 'Test', skills: ['Vue'] } });
  expect(html()).toMatchSnapshot();
});
```

---

## Storybook + Chromatic (Visual Regression)

```typescript
// CandidateCard.stories.ts
export default { title: 'Components/CandidateCard', component: CandidateCard };

export const Default = { args: { name: 'Jean Dupont', skills: ['React'] } };
export const NoSkills = { args: { name: 'Marie Martin', skills: [] } };
export const LongName = { args: { name: 'Jean-Pierre de la Fontaine du Bois', skills: ['TypeScript', 'Node.js', 'Python', 'Go', 'Rust'] } };
```

---

## Best Practices

| Practice | Why |
|----------|-----|
| Keep snapshots small | Large snapshots are hard to review |
| Use inline snapshots for small output | Easier to maintain |
| Review snapshot changes in PRs | Don't blindly update |
| Combine with visual regression | Catch CSS changes too |
| Don't snapshot dynamic data | Dates, IDs cause false failures |
