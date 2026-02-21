---
name: implement-rate-limiting
description: Add rate limiting to API endpoints to prevent abuse
argument-hint: [strategy: fixed-window|sliding-window|token-bucket]
---

# API Rate Limiting

## Fixed Window (Simple)
```csharp
// 100 requests per minute
[RateLimit(100, TimeSpan.FromMinutes(1))]
[HttpGet]
public IActionResult GetProducts() => Ok(_products);
```

## Middleware (.NET)
```csharp
public class RateLimitMiddleware
{
    private static readonly ConcurrentDictionary<string, RateLimitInfo> _clients = new();

    public async Task InvokeAsync(HttpContext context)
    {
        var clientId = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var key = $"{clientId}:{DateTime.UtcNow.Minute}";

        var info = _clients.GetOrAdd(key, _ => new RateLimitInfo());

        if (info.RequestCount >= 100)
        {
            context.Response.StatusCode = 429; // Too Many Requests
            context.Response.Headers["Retry-After"] = "60";
            await context.Response.WriteAsync("Rate limit exceeded");
            return;
        }

        Interlocked.Increment(ref info.RequestCount);
        await _next(context);
    }
}
```

## Response Headers
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1640995200
```

## Redis-Based (Distributed)
```csharp
var key = $"ratelimit:{clientId}:{DateTime.UtcNow.Minute}";
var count = await _redis.StringIncrementAsync(key);

if (count == 1)
    await _redis.KeyExpireAsync(key, TimeSpan.FromMinutes(1));

if (count > 100)
    return StatusCode(429);
```


## French HR Context

Rate limiting protects French HR APIs from abuse:
- Public job posting APIs: 100 req/min
- Authenticated HR APIs: 500 req/min
- DSN export endpoints: 5 req/hour (heavy processing)
- GDPR data export: 1 req/day (compliance)

### .NET 8 Rate Limiting

```csharp
// Program.cs - Configure rate limiting
using Microsoft.AspNetCore.RateLimiting;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRateLimiter(options =>
{
    // Default policy: Fixed window
    options.AddFixedWindowLimiter("default", opt =>
    {
        opt.PermitLimit = 100;
        opt.Window = TimeSpan.FromMinutes(1);
        opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        opt.QueueLimit = 10;
    });

    // Authenticated users: Higher limit
    options.AddFixedWindowLimiter("authenticated", opt =>
    {
        opt.PermitLimit = 500;
        opt.Window = TimeSpan.FromMinutes(1);
    });

    // Heavy endpoints (DSN export, reports)
    options.AddFixedWindowLimiter("heavy", opt =>
    {
        opt.PermitLimit = 5;
        opt.Window = TimeSpan.FromHours(1);
    });

    // GDPR data export
    options.AddFixedWindowLimiter("gdpr-export", opt =>
    {
        opt.PermitLimit = 1;
        opt.Window = TimeSpan.FromDays(1);
    });

    // Custom rejection response (French)
    options.OnRejected = async (context, token) =>
    {
        context.HttpContext.Response.StatusCode = 429;
        await context.HttpContext.Response.WriteAsJsonAsync(new
        {
            message = "Trop de requetes. Veuillez reessayer plus tard.",
            code = "RATE_LIMIT_EXCEEDED",
            retryAfter = context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter)
                ? retryAfter.TotalSeconds : 60
        }, token);
    };
});

var app = builder.Build();
app.UseRateLimiter();
```

```csharp
// Controller usage
[ApiController]
[Route("api/[controller]")]
public class CandidatesController : ControllerBase
{
    [HttpGet]
    [EnableRateLimiting("authenticated")]
    public async Task<IActionResult> GetCandidates() { /* ... */ }

    [HttpPost("export")]
    [EnableRateLimiting("heavy")]
    public async Task<IActionResult> ExportCandidates() { /* ... */ }

    [HttpGet("{id}/gdpr-export")]
    [EnableRateLimiting("gdpr-export")]
    public async Task<IActionResult> GdprExport(string id) { /* ... */ }
}
```

### Node.js/TypeScript

```typescript
import rateLimit from 'express-rate-limit';

// Default rate limiter
const defaultLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: {
    message: 'Trop de requetes. Reessayez plus tard.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true, // X-RateLimit-* headers
  legacyHeaders: false
});

// Heavy endpoint limiter
const heavyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: {
    message: 'Limite d'export atteinte. Maximum 5 par heure.',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

// Apply to routes
app.use('/api/', defaultLimiter);
app.use('/api/export', heavyLimiter);
```

## Testing

```csharp
[Fact]
public async Task RateLimiting_ExceedsLimit_Returns429()
{
    // Make 101 requests (limit is 100)
    for (int i = 0; i < 100; i++)
    {
        var response = await _client.GetAsync("/api/candidates");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    // 101st request should be rate limited
    var limitedResponse = await _client.GetAsync("/api/candidates");
    Assert.Equal(HttpStatusCode.TooManyRequests, limitedResponse.StatusCode);
}
```

## Related Skills

- `/implement-api-gateway` - Gateway-level rate limiting
- `/implement-jwt-auth` - Rate limiting per authenticated user


## Note: Contexte RH Francais

Le rate limiting dans les API RH francaises doit etre adapte aux contraintes legales : les endpoints d'export GDPR (droit d'acces Art. 15) sont limites a 1 requete/jour, les endpoints DSN a 5/heure, et les API de consultation de candidats a 500/minute pour les utilisateurs authentifies (Charge de Recrutement, Responsable RH).
