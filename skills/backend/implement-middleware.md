---
name: implement-middleware
description: Create custom middleware for request/response processing
argument-hint: [stack: dotnet|node|python]
tags: [backend, middleware, pipeline, request-processing, cross-cutting]
---

# Middleware Implementation Guide

Middleware intercepts HTTP requests/responses for cross-cutting concerns (logging, auth, compression, CORS).

---

## .NET 8 Middleware

### Convention-Based

```csharp
public class RequestTimingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<RequestTimingMiddleware> _logger;

    public RequestTimingMiddleware(RequestDelegate next, ILogger<RequestTimingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var sw = Stopwatch.StartNew();
        context.Response.OnStarting(() =>
        {
            context.Response.Headers["X-Response-Time"] = $"{sw.ElapsedMilliseconds}ms";
            return Task.CompletedTask;
        });

        try { await _next(context); }
        finally
        {
            sw.Stop();
            _logger.LogInformation("{Method} {Path} completed in {Elapsed}ms with {StatusCode}",
                context.Request.Method, context.Request.Path, sw.ElapsedMilliseconds, context.Response.StatusCode);
        }
    }
}

// Register in Program.cs (order matters!)
app.UseMiddleware<RequestTimingMiddleware>();
```

### Interface-Based (Scoped)

```csharp
public class TenantMiddleware : IMiddleware
{
    private readonly ITenantResolver _tenantResolver;

    public TenantMiddleware(ITenantResolver tenantResolver) => _tenantResolver = tenantResolver;

    public async Task InvokeAsync(HttpContext context, RequestDelegate next)
    {
        var tenantId = context.Request.Headers["X-Tenant-Id"].FirstOrDefault();
        if (tenantId != null) _tenantResolver.SetTenant(tenantId);
        await next(context);
    }
}

// Must register as scoped service
builder.Services.AddScoped<TenantMiddleware>();
app.UseMiddleware<TenantMiddleware>();
```

### Middleware Pipeline Order

```
1. ExceptionHandler (outermost - catches all)
2. HSTS
3. HttpsRedirection
4. Static Files (short-circuits for static assets)
5. Routing
6. CORS
7. Authentication
8. Authorization
9. Custom Middleware
10. Endpoint execution
```

---

## Node.js / Express

```javascript
// Timing middleware
function requestTimer(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${ms.toFixed(1)}ms`);
  });
  next();
}

// Error handler (must be last, 4 params)
function errorHandler(err, req, res, next) {
  console.error(err.stack);
  res.status(err.statusCode || 500).json({ error: err.message || 'Internal error' });
}

app.use(requestTimer);
app.use('/api', routes);
app.use(errorHandler);
```

---

## Python / FastAPI

```python
from starlette.middleware.base import BaseHTTPMiddleware
import time

class TimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        elapsed = (time.perf_counter() - start) * 1000
        response.headers["X-Response-Time"] = f"{elapsed:.1f}ms"
        return response

app.add_middleware(TimingMiddleware)
```

---

## Common Middleware Patterns

| Pattern | Purpose |
|---------|---------|
| Request logging | Audit trail, debugging |
| Correlation ID | Distributed tracing |
| Rate limiting | Protect against abuse |
| Tenant resolution | Multi-tenant apps |
| Response caching | Performance |
| Exception handling | Consistent error responses |
