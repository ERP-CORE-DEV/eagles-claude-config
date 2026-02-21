---
name: implement-cdn
description: Configure CDN for static assets, SPA deployment, and API caching
argument-hint: [provider: azure-cdn|cloudflare|cloudfront|akamai]
tags: [performance, CDN, caching, static-assets, edge, deployment]
---

# CDN Implementation Guide

CDN reduces latency by serving content from edge locations closest to users. Typical improvement: 40-80% faster page loads.

---

## Provider Comparison

| Feature | Azure CDN | Cloudflare | CloudFront | Akamai |
|---------|-----------|------------|------------|--------|
| Free tier | No | Yes (generous) | 1TB/mo | No |
| Edge locations | 150+ | 300+ | 450+ | 365,000+ |
| WAF included | Standard tier | Yes | Paid add-on | Yes |
| Custom rules | Limited | Excellent | Good | Excellent |
| Purge speed | ~10 min | ~30 sec | ~5 min | ~5 sec |
| Best for | Azure-hosted apps | Any origin | AWS-hosted | Enterprise |

---

## Azure CDN Setup

### Bicep / ARM

```bicep
resource cdnProfile 'Microsoft.Cdn/profiles@2023-05-01' = {
  name: 'cdn-rh-optimerp'
  location: 'global'
  sku: { name: 'Standard_Microsoft' }

  resource endpoint 'endpoints' = {
    name: 'ep-frontend'
    location: 'global'
    properties: {
      originHostHeader: 'storagerh.blob.core.windows.net'
      origins: [{
        name: 'blob-origin'
        properties: {
          hostName: 'storagerh.blob.core.windows.net'
          httpPort: 80
          httpsPort: 443
        }
      }]
      isHttpAllowed: false
      queryStringCachingBehavior: 'IgnoreQueryString'
    }
  }
}
```

### Cache Rules

```bicep
deliveryPolicy: {
  rules: [
    {
      name: 'CacheStaticAssets'
      order: 1
      conditions: [{ name: 'UrlFileExtension', parameters: { extensions: ['js','css','png','jpg','woff2'] } }]
      actions: [{ name: 'CacheExpiration', parameters: { cacheBehavior: 'Override', cacheType: 'All', cacheDuration: '30.00:00:00' } }]
    }
    {
      name: 'NoIndexHtmlCache'
      order: 2
      conditions: [{ name: 'UrlFileName', parameters: { matchValues: ['index.html'] } }]
      actions: [{ name: 'CacheExpiration', parameters: { cacheBehavior: 'Override', cacheDuration: '00:00:00' } }]
    }
  ]
}
```

---

## Cloudflare Setup

### Page Rules (Legacy)

```
URL: cdn.example.com/*.js
Cache Level: Cache Everything
Edge Cache TTL: 30 days
Browser Cache TTL: 7 days

URL: cdn.example.com/index.html
Cache Level: Bypass
```

### Cache Rules (Modern)

```json
{
  "expression": "(http.request.uri.path.extension in {\"js\" \"css\" \"png\" \"jpg\" \"woff2\"})",
  "action": "set_cache_settings",
  "action_parameters": {
    "cache": true,
    "edge_ttl": { "mode": "override_origin", "default": 2592000 },
    "browser_ttl": { "mode": "override_origin", "default": 604800 }
  }
}
```

---

## SPA Deployment Pattern

```
Origin (Blob/S3)
  ├── index.html          → Cache: no-cache (always fresh)
  ├── assets/
  │   ├── app.[hash].js   → Cache: 1 year (immutable)
  │   ├── app.[hash].css  → Cache: 1 year (immutable)
  │   └── vendor.[hash].js → Cache: 1 year (immutable)
  └── images/
      └── logo.svg        → Cache: 30 days
```

### Vite Config for Hashed Assets

```javascript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]',
      },
    },
  },
});
```

---

## Cache Headers

```
# Hashed assets (immutable)
Cache-Control: public, max-age=31536000, immutable

# HTML entry points
Cache-Control: no-cache, must-revalidate

# API responses
Cache-Control: private, max-age=0, no-store

# Images/fonts
Cache-Control: public, max-age=2592000
```

---

## Cache Invalidation

```bash
# Azure CDN
az cdn endpoint purge --resource-group rg-frontend \
  --profile-name cdn-rh-optimerp --name ep-frontend \
  --content-paths "/index.html" "/*"

# Cloudflare
curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/purge_cache" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -d '{"files":["https://cdn.example.com/index.html"]}'

# CloudFront
aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/index.html"
```

---

## Monitoring

| Metric | Target | Alert if |
|--------|--------|----------|
| Cache hit ratio | >90% | <80% |
| Origin bandwidth | Low | Spikes (cache miss storm) |
| Error rate (5xx) | <0.1% | >1% |
| TTFB (edge) | <50ms | >200ms |
