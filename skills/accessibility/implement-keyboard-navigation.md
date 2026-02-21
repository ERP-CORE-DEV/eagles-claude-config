---
name: implement-keyboard-navigation
description: Implement keyboard navigation for interactive components (focus management, shortcuts, roving tabindex)
argument-hint: [component: table|menu|dialog|tabs|tree]
tags: [accessibility, keyboard, a11y, focus, navigation, WCAG]
---

# Keyboard Navigation Implementation Guide

Keyboard accessibility ensures all interactive elements are operable without a mouse (WCAG 2.1 AA).

---

## 1. Focus Management

### tabIndex

```html
<div tabindex="0">In tab order</div>
<div tabindex="-1">Programmatic only</div>
<!-- NEVER use tabindex > 0 -->
```

### Focus Visible Styles

```css
:focus-visible {
  outline: 2px solid #4F46E5;
  outline-offset: 2px;
}
:focus:not(:focus-visible) { outline: none; }
```

---

## 2. Roving tabIndex (React)

For composite widgets where only one item is in the tab order.

```tsx
function RovingTabIndex<T>({ items, orientation = 'horizontal', loop = true, onSelect, getItemId, renderItem }: RovingTabIndexProps<T>) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const moveFocus = useCallback((newIndex: number) => {
    const idx = loop ? ((newIndex % items.length) + items.length) % items.length : Math.max(0, Math.min(newIndex, items.length - 1));
    setFocusedIndex(idx);
    (containerRef.current?.querySelector(`[data-index="${idx}"]`) as HTMLElement)?.focus();
  }, [items.length, loop]);

  const handleKeyDown = (e: KeyboardEvent) => {
    const prev = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
    const next = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
    switch (e.key) {
      case next: e.preventDefault(); moveFocus(focusedIndex + 1); break;
      case prev: e.preventDefault(); moveFocus(focusedIndex - 1); break;
      case 'Home': e.preventDefault(); moveFocus(0); break;
      case 'End': e.preventDefault(); moveFocus(items.length - 1); break;
      case 'Enter': case ' ': e.preventDefault(); onSelect?.(items[focusedIndex], focusedIndex); break;
    }
  };

  return (
    <div ref={containerRef} role="toolbar" onKeyDown={handleKeyDown} aria-orientation={orientation}>
      {items.map((item, i) => (
        <div key={getItemId(item)} data-index={i} tabIndex={i === focusedIndex ? 0 : -1} role="button">
          {renderItem(item, i === focusedIndex)}
        </div>
      ))}
    </div>
  );
}
```

---

## 3. Focus Trap (Modal)

```typescript
function createFocusTrap(container: HTMLElement) {
  const selectors = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  let previouslyFocused: HTMLElement | null = null;

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    const focusable = Array.from(container.querySelectorAll<HTMLElement>(selectors)).filter(el => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  return {
    activate() { previouslyFocused = document.activeElement as HTMLElement; container.addEventListener('keydown', handleKeyDown); container.querySelectorAll<HTMLElement>(selectors)[0]?.focus(); },
    deactivate() { container.removeEventListener('keydown', handleKeyDown); previouslyFocused?.focus(); },
  };
}
```

### React Hook

```tsx
function useFocusTrap(ref: React.RefObject<HTMLElement>, isActive: boolean) {
  useEffect(() => {
    if (!isActive || !ref.current) return;
    const trap = createFocusTrap(ref.current);
    trap.activate();
    return () => trap.deactivate();
  }, [isActive, ref]);
}
```

---

## 4. Keyboard Shortcuts

```typescript
class KeyboardShortcutManager {
  private shortcuts = new Map<string, { handler: (e: KeyboardEvent) => void; description: string }>();

  register(key: string, modifiers: string[], handler: (e: KeyboardEvent) => void, description: string) {
    const id = [...modifiers].sort().join('+') + (modifiers.length ? '+' : '') + key.toLowerCase();
    this.shortcuts.set(id, { handler, description });
    return () => this.shortcuts.delete(id);
  }

  handleKeyDown = (e: KeyboardEvent) => {
    const mods: string[] = [];
    if (e.ctrlKey || e.metaKey) mods.push('ctrl');
    if (e.altKey) mods.push('alt');
    if (e.shiftKey) mods.push('shift');
    const id = [...mods].sort().join('+') + (mods.length ? '+' : '') + e.key.toLowerCase();
    const shortcut = this.shortcuts.get(id);
    if (shortcut) { e.preventDefault(); shortcut.handler(e); }
  };
}

const shortcuts = new KeyboardShortcutManager();
document.addEventListener('keydown', shortcuts.handleKeyDown);
shortcuts.register('k', ['ctrl'], () => openSearch(), 'Open search');
shortcuts.register('s', ['ctrl'], () => save(), 'Save');
```

---

## 5. Component Keyboard Patterns

| Widget | Keys | ARIA Role |
|--------|------|-----------|
| Button | Enter, Space | `button` |
| Menu | Arrows, Enter, Escape | `menu` + `menuitem` |
| Tabs | Arrows, Home/End | `tablist` + `tab` |
| Dialog | Tab (trapped), Escape | `dialog` |
| Tree | Arrows, Home/End, Enter | `tree` + `treeitem` |
| Grid | Arrows, Home/End | `grid` + `gridcell` |
| Combobox | Arrows, Enter, Escape | `combobox` + `listbox` |

---

## 6. Skip Navigation

```html
<a href="#main" class="skip-link">Skip to main content</a>
<main id="main" tabindex="-1">...</main>

<style>
.skip-link { position: absolute; top: -40px; left: 0; padding: 8px 16px; background: #1a1a2e; color: white; z-index: 100; transition: top 0.2s; }
.skip-link:focus { top: 0; }
</style>
```

---

## 7. Testing (Playwright)

```typescript
test('modal focus trap', async ({ page }) => {
  await page.click('[data-testid="open-modal"]');
  await expect(page.locator('[data-testid="modal-close"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="open-modal"]')).toBeFocused();
});
```
