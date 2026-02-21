---
name: setup-e2e-tests
description: Setup end-to-end tests with Playwright, Cypress, or Selenium
argument-hint: [framework: playwright|cypress|selenium]
tags: [testing, e2e, Playwright, Cypress, end-to-end, integration]
---

# E2E Testing Guide

E2E tests verify complete user workflows through the actual UI.

---

## Playwright (Recommended)

```bash
npm init playwright@latest
```

```typescript
import { test, expect } from '@playwright/test';

test.describe('Candidate Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('#email', 'admin@example.com');
    await page.fill('#password', 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test('create a new candidate', async ({ page }) => {
    await page.click('text=Candidats');
    await page.click('text=Nouveau candidat');
    await page.fill('[name="fullName"]', 'Jean Dupont');
    await page.fill('[name="email"]', 'jean@example.com');
    await page.selectOption('[name="contractType"]', 'CDI');
    await page.click('button:has-text("Enregistrer")');

    await expect(page.locator('.notification-success')).toBeVisible();
    await expect(page.locator('table')).toContainText('Jean Dupont');
  });

  test('filter candidates by skill', async ({ page }) => {
    await page.click('text=Candidats');
    await page.fill('[placeholder="Rechercher..."]', 'React');
    await page.keyboard.press('Enter');

    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(3);
    for (const row of await rows.all()) {
      await expect(row).toContainText('React');
    }
  });
});
```

### Page Object Pattern

```typescript
class CandidateListPage {
  constructor(private page: Page) {}

  async goto() { await this.page.goto('/candidates'); }
  async search(query: string) { await this.page.fill('[placeholder="Rechercher..."]', query); await this.page.keyboard.press('Enter'); }
  async clickNew() { await this.page.click('text=Nouveau candidat'); }
  async getRowCount() { return this.page.locator('table tbody tr').count(); }
  async getRowText(index: number) { return this.page.locator(`table tbody tr:nth-child(${index + 1})`).textContent(); }
}
```

### Configuration

```typescript
// playwright.config.ts
export default defineConfig({
  testDir: './e2e',
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
});
```

---

## Cypress

```javascript
describe('Candidate Management', () => {
  beforeEach(() => {
    cy.login('admin@example.com', 'password');
    cy.visit('/candidates');
  });

  it('creates a candidate', () => {
    cy.contains('Nouveau candidat').click();
    cy.get('[name="fullName"]').type('Jean Dupont');
    cy.get('[name="email"]').type('jean@example.com');
    cy.contains('Enregistrer').click();
    cy.get('.notification-success').should('be.visible');
  });
});
```

---

## Best Practices

| Practice | Why |
|----------|-----|
| Test user workflows, not implementation | Resilient to refactoring |
| Use Page Object pattern | Reusable, maintainable |
| Run on CI with retries | Flaky test mitigation |
| Test critical paths only | E2E is slow; use unit tests for edge cases |
| Use data-testid selectors | Stable selectors |
