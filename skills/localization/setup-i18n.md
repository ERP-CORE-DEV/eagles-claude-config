---
name: setup-i18n
description: Setup internationalization with translation files and language switching
argument-hint: [framework: react|vue|angular] [library: i18next|vue-i18n|ngx-translate]
tags: [localization, i18n, translations, internationalization, multi-language]
---

# Internationalization (i18n) Guide

---

## React (react-i18next)

```bash
npm install react-i18next i18next i18next-http-backend i18next-browser-languagedetector
```

```typescript
// i18n.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import Backend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n.use(Backend).use(LanguageDetector).use(initReactI18next).init({
  fallbackLng: 'fr',
  supportedLngs: ['fr', 'en', 'de', 'es'],
  ns: ['common', 'candidates', 'matching'],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  backend: { loadPath: '/locales/{{lng}}/{{ns}}.json' },
});
```

```json
// /locales/fr/common.json
{
  "nav": { "candidates": "Candidats", "offers": "Offres d'emploi", "matching": "Correspondance" },
  "actions": { "save": "Enregistrer", "cancel": "Annuler", "delete": "Supprimer", "search": "Rechercher" },
  "messages": {
    "saved": "Enregistre avec succes",
    "deleted": "{{name}} a ete supprime",
    "results": "{{count}} resultat",
    "results_plural": "{{count}} resultats"
  }
}
```

```tsx
import { useTranslation } from 'react-i18next';

function CandidateList() {
  const { t, i18n } = useTranslation(['candidates', 'common']);
  return (
    <div>
      <h1>{t('candidates:title')}</h1>
      <button onClick={() => i18n.changeLanguage('en')}>EN</button>
      <p>{t('common:messages.results', { count: 15 })}</p>
    </div>
  );
}
```

---

## Vue (vue-i18n)

```typescript
import { createI18n } from 'vue-i18n';
const i18n = createI18n({
  locale: 'fr',
  fallbackLocale: 'en',
  messages: {
    fr: { greeting: 'Bonjour {name}' },
    en: { greeting: 'Hello {name}' },
  },
});
```

```vue
<template>
  <p>{{ $t('greeting', { name: 'Jean' }) }}</p>
</template>
```

---

## Date/Number Formatting

```typescript
// Use Intl API
const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });
dateFormatter.format(new Date()); // "7 fevrier 2026"

const currencyFormatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
currencyFormatter.format(45000); // "45 000,00 EUR"

const relativeTime = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
relativeTime.format(-1, 'day'); // "hier"
```

---

## Best Practices

| Practice | Why |
|----------|-----|
| Extract ALL user-facing strings | No hardcoded text |
| Use namespaced keys | Avoid collisions |
| Support pluralization | Languages have different rules |
| Use ICU message format | Complex plurals, gender |
| Lazy-load translations | Don't load all languages upfront |
| Test with pseudo-localization | Catch hardcoded strings |
