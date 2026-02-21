---
name: create-responsive-design
description: Create responsive layouts using CSS Grid, Flexbox, and media queries
argument-hint: [approach: mobile-first|desktop-first] [framework: tailwind|css-modules|styled]
tags: [mobile, responsive, CSS, Grid, Flexbox, media-queries, Tailwind]
---

# Responsive Design Guide

Mobile-first approach: design for small screens first, enhance for larger.

---

## Breakpoints

| Name | Min Width | Tailwind | Target |
|------|-----------|----------|--------|
| sm | 640px | `sm:` | Large phones |
| md | 768px | `md:` | Tablets |
| lg | 1024px | `lg:` | Laptops |
| xl | 1280px | `xl:` | Desktops |
| 2xl | 1536px | `2xl:` | Large screens |

---

## CSS Grid Layout

```css
.dashboard {
  display: grid;
  gap: 1rem;
  grid-template-columns: 1fr; /* Mobile: single column */
}

@media (min-width: 768px) {
  .dashboard { grid-template-columns: repeat(2, 1fr); } /* Tablet: 2 cols */
}

@media (min-width: 1024px) {
  .dashboard { grid-template-columns: 280px 1fr 300px; } /* Desktop: sidebar + content + aside */
}
```

---

## Flexbox Patterns

```css
.card-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}
.card {
  flex: 1 1 100%; /* Mobile: full width */
}
@media (min-width: 768px) { .card { flex: 1 1 calc(50% - 0.5rem); } }
@media (min-width: 1024px) { .card { flex: 1 1 calc(33.333% - 0.667rem); } }
```

---

## Tailwind CSS

```html
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  <div class="p-4 bg-white rounded-lg shadow">Card 1</div>
  <div class="p-4 bg-white rounded-lg shadow">Card 2</div>
  <div class="p-4 bg-white rounded-lg shadow">Card 3</div>
</div>

<!-- Responsive navigation -->
<nav class="flex flex-col md:flex-row md:items-center gap-4">
  <a href="/" class="text-lg font-bold">Logo</a>
  <div class="hidden md:flex gap-4">
    <a href="/candidates">Candidats</a>
    <a href="/offers">Offres</a>
  </div>
  <button class="md:hidden">Menu</button>
</nav>
```

---

## Fluid Typography

```css
html {
  font-size: clamp(14px, 1vw + 12px, 18px);
}
h1 { font-size: clamp(1.5rem, 3vw + 1rem, 3rem); }
```

---

## Container Queries (Modern)

```css
.card-container { container-type: inline-size; }

@container (min-width: 400px) {
  .card { display: grid; grid-template-columns: auto 1fr; }
}
```

---

## Testing

```typescript
// Playwright responsive test
for (const viewport of [{ width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
  test(`renders at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/dashboard');
    await expect(page.locator('.sidebar')).toBeVisible({ visible: viewport.width >= 1024 });
  });
}
```
