---
name: version-api
description: Implement API versioning with URL, header, and query string strategies
argument-hint: [strategy: url|header|query] [framework: dotnet|express|fastapi]
tags: [api, versioning, rest, backward-compatibility]
---

# API Versioning Strategies

API versioning ensures backward compatibility while allowing evolution. Choose a
strategy based on client ecosystem, discoverability needs, and caching behavior.

| Strategy       | Discoverability | Cache-Friendly | Client Complexity |
|----------------|-----------------|----------------|-------------------|
| URL path       | High            | Yes            | Low               |
| Header         | Low             | Varies         | Medium            |
| Query string   | Medium          | Yes            | Low               |

---

## 1. URL Path Versioning (`/api/v1/`)

The most widely adopted strategy. The version is embedded directly in the URL,
making it immediately visible in logs, documentation, and browser address bars.

```
GET /api/v1/candidates
GET /api/v2/candidates
```

Advantages:
- Explicit and self-documenting
- Works naturally with API gateways, CDN caching, and route-based load balancing
- Easy to test in browsers or curl without special headers

Drawbacks:
- URL changes can break bookmarks and hardcoded clients
- Proliferates route definitions when many versions coexist

---

## 2. Header Versioning

Version information travels in HTTP headers. Two common approaches:

### Accept-Version Header (Vendor-Neutral)
```
GET /api/candidates
Accept-Version: 2.0
```

### Custom X-API-Version Header
```
GET /api/candidates
X-API-Version: 2
```

### Content Negotiation (Media Type Versioning)
```
GET /api/candidates
Accept: application/vnd.mycompany.candidates.v2+json
```

Advantages:
- Clean URLs that never change
- Follows HTTP content negotiation semantics (media type approach)

Drawbacks:
- Not visible in server logs or browser address bars by default
- Requires clients to set headers explicitly
- CDN and proxy caching must include Vary header for correctness

---

## 3. Query String Versioning (`?v=1`)

```
GET /api/candidates?v=1
GET /api/candidates?api-version=2.0
```

Advantages:
- Simple to add to existing APIs without route changes
- Easy to override per-request for testing

Drawbacks:
- Can clutter query parameters
- Some caching layers strip or ignore query strings

---

## Framework Implementations

### .NET 8 with Asp.Versioning.Http

Install the NuGet packages:

```bash
dotnet add package Asp.Versioning.Http
dotnet add package Asp.Versioning.Mvc.ApiExplorer
```

Register versioning in `Program.cs`:

```csharp
using Asp.Versioning;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddApiVersioning(options =>
{
    options.DefaultApiVersion = new ApiVersion(1, 0);
    options.AssumeDefaultVersionWhenUnspecified = true;
    options.ReportApiVersions = true; // Adds api-supported-versions header

    // Combine multiple readers for flexible client usage
    options.ApiVersionReader = ApiVersionReader.Combine(
        new UrlSegmentApiVersionReader(),
        new HeaderApiVersionReader("X-API-Version", "Accept-Version"),
        new QueryStringApiVersionReader("api-version")
    );
})
.AddApiExplorer(options =>
{
    options.GroupNameFormat = "'v'VVV";
    options.SubstituteApiVersionInUrl = true;
});

builder.Services.AddControllers();
var app = builder.Build();
app.MapControllers();
app.Run();
```

Versioned controller:

```csharp
using Asp.Versioning;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/v{version:apiVersion}/[controller]")]
[ApiVersion("1.0")]
[ApiVersion("2.0")]
public class CandidatesController : ControllerBase
{
    [HttpGet]
    [MapToApiVersion("1.0")]
    public IActionResult GetV1()
        => Ok(new { id = 1, name = "Dupont" });

    [HttpGet]
    [MapToApiVersion("2.0")]
    public IActionResult GetV2()
        => Ok(new { id = 1, fullName = "Jean Dupont", skills = new[] { "C#", "Azure" } });

    [HttpGet("{id}")]
    [MapToApiVersion("1.0")]
    [MapToApiVersion("2.0")]
    public IActionResult GetById(int id)
        => Ok(new { id });
}
```

Marking a version as deprecated:

```csharp
[ApiVersion("1.0", Deprecated = true)]
[ApiVersion("2.0")]
public class CandidatesController : ControllerBase { }
```

When `Deprecated = true` is set and `ReportApiVersions = true`, the response
includes:

```
api-supported-versions: 2.0
api-deprecated-versions: 1.0
```

### Node.js / Express with express-routes-versioning

Install the package:

```bash
npm install express-routes-versioning
```

Implementation:

```javascript
const express = require('express');
const routesVersioning = require('express-routes-versioning')();
const app = express();

// Extract version from header, query, or URL
function extractVersion(req, res, next) {
    req.version =
        req.headers['accept-version'] ||
        req.headers['x-api-version'] ||
        req.query.v ||
        req.params.version ||
        '1.0.0';
    next();
}

app.use(extractVersion);

// Versioned route handler
app.get('/api/candidates', routesVersioning({
    '1.0.0': (req, res) => {
        res.json({ id: 1, name: 'Dupont' });
    },
    '2.0.0': (req, res) => {
        res.json({ id: 1, fullName: 'Jean Dupont', skills: ['Node.js', 'React'] });
    },
    // Fallback if no version matches
    default: (req, res) => {
        res.status(400).json({ error: 'Unsupported API version' });
    }
}));

// URL path versioning alternative
app.get('/api/v:version/candidates', (req, res, next) => {
    req.version = `${req.params.version}.0.0`;
    next();
}, routesVersioning({
    '1.0.0': (req, res) => res.json({ version: 'v1', data: [] }),
    '2.0.0': (req, res) => res.json({ version: 'v2', data: [], meta: {} }),
}));

// Deprecation middleware
function deprecationHeaders(sunsetDate, alternativeUrl) {
    return (req, res, next) => {
        res.set('Deprecation', 'true');
        res.set('Sunset', new Date(sunsetDate).toUTCString());
        res.set('Link', `<${alternativeUrl}>; rel="successor-version"`);
        next();
    };
}

app.get('/api/v1/candidates',
    deprecationHeaders('2026-06-01', '/api/v2/candidates'),
    (req, res) => res.json({ id: 1, name: 'Dupont' })
);

app.listen(3000);
```

### Python / FastAPI with APIRouter Prefix

```python
from fastapi import FastAPI, Header, Query, HTTPException
from fastapi.responses import JSONResponse
from typing import Optional
from datetime import datetime

app = FastAPI(title="Candidate API", version="2.0.0")

# --- URL Path Versioning with APIRouter ---

from fastapi import APIRouter

v1_router = APIRouter(prefix="/api/v1", tags=["v1 - deprecated"])
v2_router = APIRouter(prefix="/api/v2", tags=["v2 - current"])

@v1_router.get("/candidates")
async def get_candidates_v1():
    return {"id": 1, "name": "Dupont"}

@v2_router.get("/candidates")
async def get_candidates_v2():
    return {"id": 1, "full_name": "Jean Dupont", "skills": ["Python", "FastAPI"]}

app.include_router(v1_router)
app.include_router(v2_router)

# --- Header Versioning ---

@app.get("/api/candidates")
async def get_candidates_header(
    accept_version: Optional[str] = Header(None, alias="Accept-Version"),
    x_api_version: Optional[str] = Header(None, alias="X-API-Version"),
    v: Optional[int] = Query(None, description="API version as query parameter"),
):
    version = accept_version or x_api_version or (str(v) if v else "2")

    if version.startswith("1"):
        return {"id": 1, "name": "Dupont"}
    elif version.startswith("2"):
        return {"id": 1, "full_name": "Jean Dupont", "skills": ["Python", "FastAPI"]}
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported API version: {version}")

# --- Deprecation Middleware ---

from starlette.middleware.base import BaseHTTPMiddleware

class DeprecationMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/api/v1"):
            response.headers["Deprecation"] = "true"
            response.headers["Sunset"] = "Sat, 01 Jun 2026 00:00:00 GMT"
            response.headers["Link"] = '</api/v2>; rel="successor-version"'
        return response

app.add_middleware(DeprecationMiddleware)
```

---

## Deprecation Headers and Sunset Policy

When retiring an API version, communicate the timeline through standard headers:

```
Deprecation: true
Sunset: Sat, 01 Jun 2026 00:00:00 GMT
Link: </api/v2/candidates>; rel="successor-version"
```

### Recommended Sunset Timeline

| Phase            | Duration     | Action                                      |
|------------------|-------------|----------------------------------------------|
| Announcement     | Day 0       | Set `Deprecation: true` header               |
| Migration window | 3-6 months  | Log usage metrics, notify consumers          |
| Warning period   | Last 30 days| Return `Warning` header with countdown       |
| Sunset           | End date    | Return `410 Gone` with migration guide link  |

### Warning Header (Final 30 Days)

```
Warning: 299 - "API v1 will be removed on 2026-06-01. Migrate to /api/v2/"
```

After the sunset date, respond with:

```json
{
    "error": "API_VERSION_SUNSET",
    "message": "API v1 was retired on 2026-06-01.",
    "migration_guide": "https://docs.example.com/api/migration/v1-to-v2",
    "current_version": "/api/v2/"
}
```

---

## Version Negotiation

When a client requests a version that does not exist or is ambiguous, the API
must respond predictably:

| Scenario                        | Recommended Response                            |
|---------------------------------|-------------------------------------------------|
| No version specified            | Use default (latest stable or configured)       |
| Exact version match             | Serve that version                              |
| Version not found               | `400 Bad Request` with supported versions list  |
| Deprecated version requested    | Serve it but include deprecation headers        |
| Sunset version requested        | `410 Gone` with migration link                  |

Response for unsupported version:

```json
{
    "error": "UNSUPPORTED_API_VERSION",
    "requested_version": "3.0",
    "supported_versions": ["1.0 (deprecated)", "2.0 (current)"],
    "documentation": "https://docs.example.com/api/versions"
}
```

---

## Breaking vs Non-Breaking Changes

### Non-Breaking Changes (No Version Bump Required)

These changes are backward-compatible and safe to deploy to the existing version:

- Adding new optional fields to response bodies
- Adding new optional query parameters or headers
- Adding new endpoints or HTTP methods
- Relaxing validation constraints (e.g., increasing max length)
- Adding new enum values to response-only fields
- Performance improvements with identical contracts
- Adding new optional request body fields with sensible defaults

### Breaking Changes (Require a New Version)

These changes will break existing clients and require a major version increment:

- Removing or renaming fields in response bodies
- Removing or renaming endpoints or query parameters
- Changing field types (e.g., `string` to `int`, `object` to `array`)
- Changing the meaning or behavior of existing fields
- Adding new required request fields without defaults
- Changing authentication or authorization schemes
- Modifying error response structure or status codes
- Removing enum values from request-accepted fields
- Changing pagination structure or default page sizes

### Decision Checklist

Before deploying a change, verify:

1. Can existing clients deserialize the new response without errors?
2. Can existing requests (with no modifications) still be processed?
3. Do existing integrations and webhooks still function?
4. Are error codes and status codes unchanged for existing flows?

If any answer is "no", the change is breaking and requires a new API version.

---

## Best Practices Summary

1. **Pick one primary strategy** and stick with it across all services. URL path
   versioning is the most common choice for public APIs. Header versioning suits
   internal microservice communication.

2. **Support at most 2-3 active versions** simultaneously. More than that creates
   excessive maintenance burden and test matrix expansion.

3. **Always report supported versions** in response headers so clients can
   discover what is available without consulting documentation.

4. **Use semantic versioning** (MAJOR.MINOR) for API versions. Only increment
   MAJOR for breaking changes. MINOR increments signal additive features.

5. **Automate deprecation enforcement** with middleware that injects headers and
   logs usage of deprecated versions for monitoring dashboards.

6. **Version your OpenAPI/Swagger specs** alongside the code. Each version should
   have its own spec document or a clearly separated section.

7. **Test all active versions in CI/CD** to prevent regressions. Contract tests
   (Pact, Dredd) catch version incompatibilities early.

8. **Document migration paths** with concrete before/after examples for every
   breaking change between versions.
