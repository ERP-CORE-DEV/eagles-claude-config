---
name: add-compression
description: Add HTTP response compression (Gzip, Brotli, Zstd) to reduce payload size
argument-hint: [stack: dotnet|node|python|nginx] [algorithm: gzip|brotli|zstd]
tags: [performance, compression, gzip, brotli, http, middleware]
---

# HTTP Response Compression Guide

Compression reduces payload size by 60-90%.

| Algorithm | Ratio | Browser Support | Best For |
|-----------|-------|-----------------|----------|
| Gzip | Good | Universal | Default choice |
| Brotli | 15-25% better | Modern browsers | Static assets, HTTPS |
| Zstandard | Best | Chrome 123+ | Server-to-server |

---

## .NET 8

```csharp
builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
    options.Providers.Add<BrotliCompressionProvider>();
    options.Providers.Add<GzipCompressionProvider>();
    options.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat(new[]
    { "application/json", "application/javascript", "text/css", "image/svg+xml" });
});
builder.Services.Configure<BrotliCompressionProviderOptions>(o => o.Level = CompressionLevel.Optimal);
builder.Services.Configure<GzipCompressionProviderOptions>(o => o.Level = CompressionLevel.Optimal);

// IMPORTANT: before UseStaticFiles
app.UseResponseCompression();
app.UseStaticFiles();
```

---

## Node.js / Express

```javascript
const compression = require('compression');
app.use(compression({ level: 6, threshold: 1024,
  filter: (req, res) => {
    if (req.headers['accept'] === 'text/event-stream') return false;
    return compression.filter(req, res);
  },
}));

// Brotli
const shrinkRay = require('shrink-ray-current');
app.use(shrinkRay({ brotli: { quality: 4 }, zlib: { level: 6 } }));

// Pre-compressed static
const expressStaticGzip = require('express-static-gzip');
app.use('/', expressStaticGzip('dist', { enableBrotli: true, orderPreference: ['br', 'gzip'] }));
```

---

## Python / FastAPI

```python
from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware
app = FastAPI()
app.add_middleware(GZipMiddleware, minimum_size=500)

# Brotli: pip install brotli-asgi
from brotli_asgi import BrotliMiddleware
app.add_middleware(BrotliMiddleware, quality=4, minimum_size=500)
```

---

## Nginx

```nginx
http {
    gzip on; gzip_vary on; gzip_proxied any; gzip_comp_level 6; gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript image/svg+xml;
    brotli on; brotli_comp_level 4; brotli_min_length 1024;
    brotli_types text/plain text/css application/json application/javascript image/svg+xml;
    brotli_static on; gzip_static on;
}
```

---

## Build-Time (Vite)

```javascript
import viteCompression from 'vite-plugin-compression';
export default {
  plugins: [
    viteCompression({ algorithm: 'gzip', threshold: 1024 }),
    viteCompression({ algorithm: 'brotliCompress', threshold: 1024, ext: '.br' }),
  ],
};
```

---

## What NOT to Compress

| Content | Reason |
|---------|--------|
| JPEG/PNG/WebP | Already compressed |
| ZIP/GZIP archives | Already compressed |
| Responses < 1KB | Overhead exceeds savings |

## Measuring

```bash
curl -H "Accept-Encoding: gzip, br" -sI https://example.com/api | grep content-encoding
```
