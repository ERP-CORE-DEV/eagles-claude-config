---
name: implement-pwa
description: Convert web app to Progressive Web App with service workers and manifest
argument-hint: [framework: react|vue|angular|vite]
tags: [mobile, PWA, service-worker, offline, manifest, push-notifications]
---

# Progressive Web App Guide

PWAs provide native-like experience: offline support, install prompt, push notifications.

---

## Web App Manifest

```json
{
  "name": "RH-OptimERP Candidats",
  "short_name": "Candidats",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#4F46E5",
  "icons": [
    { "src": "/icons/192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#4F46E5" />
<link rel="apple-touch-icon" href="/icons/192.png" />
```

---

## Service Worker (Workbox)

```bash
npm install workbox-webpack-plugin  # or vite-plugin-pwa
```

### Vite PWA Plugin

```typescript
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.example\.com\/api\/.*/,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache', expiration: { maxEntries: 100, maxAgeSeconds: 300 } },
          },
        ],
      },
      manifest: {
        name: 'My App',
        short_name: 'App',
        theme_color: '#4F46E5',
      },
    }),
  ],
});
```

---

## Caching Strategies

| Strategy | When | Use For |
|----------|------|---------|
| Cache First | Content rarely changes | Static assets, fonts |
| Network First | Freshness matters | API calls, dynamic data |
| Stale While Revalidate | Balance speed + freshness | Images, non-critical API |
| Network Only | Always fresh | Auth, payments |
| Cache Only | Never changes | Versioned static assets |

---

## Install Prompt (React)

```tsx
function useInstallPrompt() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setPrompt(e as BeforeInstallPromptEvent); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    setPrompt(null);
  };

  return { canInstall: !!prompt, install };
}
```

---

## Lighthouse PWA Audit

```bash
npx lighthouse https://myapp.example.com --only-categories=pwa --output=html
```

Required scores: Installable, Works Offline, HTTPS, Fast Loading.
