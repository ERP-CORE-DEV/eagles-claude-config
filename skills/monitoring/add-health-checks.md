---
name: add-health-checks
description: Implement health check endpoints for liveness and readiness probes
argument-hint: [type: liveness|readiness|startup] [stack: dotnet|node|python]
---

# Health Check Implementation

## Understanding Probe Types

**Liveness Probe** -- "Is the process alive?"
- Checks if the application process is running and not deadlocked.
- Should NOT check external dependencies (database, cache, queues).
- Failure action: Kubernetes restarts the container.
- Keep it fast and simple -- a stuck process must be detected quickly.

**Readiness Probe** -- "Can this instance accept traffic?"
- Checks if the application can serve requests (dependencies are reachable).
- Should verify database connectivity, cache availability, required services.
- Failure action: Kubernetes removes the pod from the Service endpoints (no traffic routed to it).
- The pod stays running; once healthy again, traffic resumes.

**Startup Probe** -- "Has the app finished initializing?"
- Used for slow-starting containers (migrations, large cache warm-up).
- While the startup probe is running, liveness and readiness probes are disabled.
- Failure action: Kubernetes kills and restarts the container after `failureThreshold * periodSeconds`.
- Use this to avoid false-positive liveness failures during boot.

---

## .NET 8 Health Checks

### NuGet Packages

```xml
<PackageReference Include="AspNetCore.HealthChecks.SqlServer" Version="8.0.*" />
<PackageReference Include="AspNetCore.HealthChecks.Redis" Version="8.0.*" />
<PackageReference Include="AspNetCore.HealthChecks.CosmosDb" Version="8.0.*" />
<PackageReference Include="AspNetCore.HealthChecks.RabbitMQ" Version="8.0.*" />
<PackageReference Include="AspNetCore.HealthChecks.UI" Version="8.0.*" />
<PackageReference Include="AspNetCore.HealthChecks.UI.InMemory.Storage" Version="8.0.*" />
```

### Program.cs -- Registering Health Checks with Tags

```csharp
using Microsoft.Extensions.Diagnostics.HealthChecks;

builder.Services.AddHealthChecks()
    // Self check -- always included in liveness
    .AddCheck("self", () => HealthCheckResult.Healthy(), tags: new[] { "live" })

    // SQL Server
    .AddSqlServer(
        connectionString: builder.Configuration.GetConnectionString("DefaultConnection")!,
        healthQuery: "SELECT 1;",
        name: "sqlserver",
        failureStatus: HealthStatus.Unhealthy,
        tags: new[] { "ready", "db" })

    // Redis
    .AddRedis(
        redisConnectionString: builder.Configuration["Redis:ConnectionString"]!,
        name: "redis",
        failureStatus: HealthStatus.Degraded,
        tags: new[] { "ready", "cache" })

    // Azure Cosmos DB
    .AddAzureCosmosDB(
        connectionStringFactory: sp =>
            builder.Configuration["CosmosDb:ConnectionString"]!,
        configureOptions: options =>
        {
            options.DatabaseId = builder.Configuration["CosmosDb:DatabaseName"];
            options.ContainerIds = new[] { "Candidates", "Jobs", "Matches" };
        },
        name: "cosmosdb",
        failureStatus: HealthStatus.Unhealthy,
        tags: new[] { "ready", "db" })

    // RabbitMQ
    .AddRabbitMQ(
        rabbitConnectionString: builder.Configuration["RabbitMQ:ConnectionString"]!,
        name: "rabbitmq",
        failureStatus: HealthStatus.Degraded,
        tags: new[] { "ready", "messaging" })

    // Custom external API check
    .AddCheck<ExternalApiHealthCheck>(
        "external-matching-api",
        failureStatus: HealthStatus.Degraded,
        tags: new[] { "ready", "external" });
```

### Mapping Endpoints with Filtering

```csharp
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using System.Text.Json;

// Liveness -- only self check, no dependencies
app.MapHealthChecks("/health/live", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("live"),
    ResponseWriter = WriteHealthResponse
});

// Readiness -- all dependency checks
app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready"),
    ResponseWriter = WriteHealthResponse
});

// Startup -- lightweight check that app is initialized
app.MapHealthChecks("/health/startup", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("live"),
    ResponseWriter = WriteHealthResponse
});

// Full detail endpoint (restrict to internal/admin access)
app.MapHealthChecks("/health", new HealthCheckOptions
{
    ResponseWriter = WriteHealthResponse
}).RequireAuthorization("AdminOnly");

// Custom JSON response writer
static Task WriteHealthResponse(HttpContext context, HealthReport report)
{
    context.Response.ContentType = "application/json";

    var response = new
    {
        status = report.Status.ToString(),
        totalDuration = report.TotalDuration.ToString(),
        checks = report.Entries.Select(e => new
        {
            name = e.Key,
            status = e.Value.Status.ToString(),
            duration = e.Value.Duration.ToString(),
            description = e.Value.Description,
            exception = e.Value.Exception?.Message,
            data = e.Value.Data
        })
    };

    return context.Response.WriteAsJsonAsync(response,
        new JsonSerializerOptions { WriteIndented = true });
}
```

### Custom Health Check with Degraded State

```csharp
public class ExternalApiHealthCheck : IHealthCheck
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<ExternalApiHealthCheck> _logger;
    private static readonly TimeSpan DegradedThreshold = TimeSpan.FromSeconds(2);

    public ExternalApiHealthCheck(
        IHttpClientFactory httpClientFactory,
        ILogger<ExternalApiHealthCheck> logger)
    {
        _httpClient = httpClientFactory.CreateClient("ExternalApi");
        _logger = logger;
    }

    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var sw = System.Diagnostics.Stopwatch.StartNew();
            var response = await _httpClient.GetAsync("/api/ping", cancellationToken);
            sw.Stop();

            var data = new Dictionary<string, object>
            {
                ["responseTime"] = sw.ElapsedMilliseconds,
                ["statusCode"] = (int)response.StatusCode
            };

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("External API returned {StatusCode}", response.StatusCode);
                return HealthCheckResult.Unhealthy(
                    $"External API returned {response.StatusCode}", data: data);
            }

            if (sw.Elapsed > DegradedThreshold)
            {
                _logger.LogWarning("External API slow: {Elapsed}ms", sw.ElapsedMilliseconds);
                return HealthCheckResult.Degraded(
                    $"External API response slow ({sw.ElapsedMilliseconds}ms)", data: data);
            }

            return HealthCheckResult.Healthy("External API is responsive", data);
        }
        catch (TaskCanceledException)
        {
            return HealthCheckResult.Unhealthy("External API request timed out");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "External API health check failed");
            return HealthCheckResult.Unhealthy("External API unreachable", ex);
        }
    }
}
```

### Health Check UI

```csharp
// In Program.cs -- register the UI
builder.Services.AddHealthChecksUI(setup =>
{
    setup.SetEvaluationTimeInSeconds(30);
    setup.MaximumHistoryEntriesPerEndpoint(50);
    setup.AddHealthCheckEndpoint("Self", "/health");
    setup.AddHealthCheckEndpoint("Matching Engine", "http://matching-engine:8080/health");
    setup.AddHealthCheckEndpoint("Training Service", "http://training-service:8080/health");
})
.AddInMemoryStorage();

// Map the UI endpoint
app.MapHealthChecksUI(options =>
{
    options.UIPath = "/health-ui";
    options.ApiPath = "/health-ui-api";
});
```

---

## Node.js Health Checks

### Using @godaddy/terminus (Express / Fastify / Koa)

```bash
npm install @godaddy/terminus
```

```javascript
// health.js
const { createTerminus } = require('@godaddy/terminus');
const http = require('http');
const express = require('express');
const { createClient } = require('redis');
const { MongoClient } = require('mongodb');
const amqp = require('amqplib');

const app = express();
const server = http.createServer(app);

// Dependency clients
const redisClient = createClient({ url: process.env.REDIS_URL });
const mongoClient = new MongoClient(process.env.MONGO_URL);

// Health check functions
async function onHealthCheck() {
  const checks = {};
  const errors = [];

  // Database check
  try {
    await mongoClient.db('admin').command({ ping: 1 });
    checks.database = { status: 'healthy' };
  } catch (err) {
    checks.database = { status: 'unhealthy', error: err.message };
    errors.push(err);
  }

  // Redis check
  try {
    const start = Date.now();
    await redisClient.ping();
    const duration = Date.now() - start;
    checks.redis = {
      status: duration > 1000 ? 'degraded' : 'healthy',
      responseTime: `${duration}ms`
    };
  } catch (err) {
    checks.redis = { status: 'unhealthy', error: err.message };
    errors.push(err);
  }

  // RabbitMQ check
  try {
    const conn = await amqp.connect(process.env.RABBITMQ_URL);
    await conn.close();
    checks.rabbitmq = { status: 'healthy' };
  } catch (err) {
    checks.rabbitmq = { status: 'unhealthy', error: err.message };
    errors.push(err);
  }

  if (errors.length > 0) {
    throw Object.assign(new Error('Unhealthy dependencies'), { checks });
  }

  return checks;
}

function onLivenessCheck() {
  // Only check if the process is alive -- no external deps
  return Promise.resolve({ status: 'alive', uptime: process.uptime() });
}

createTerminus(server, {
  healthChecks: {
    '/health/ready': onHealthCheck,    // Readiness
    '/health/live': onLivenessCheck,   // Liveness
    verbatim: true                     // Return check details in response body
  },
  onSignal: async () => {
    console.log('Server is shutting down...');
    await mongoClient.close();
    await redisClient.quit();
  },
  onShutdown: async () => {
    console.log('Cleanup complete, server shut down.');
  },
  logger: console.error,
});

server.listen(8080);
```

### Custom Health Route (Without Terminus)

```javascript
// routes/health.js
const express = require('express');
const router = express.Router();

const checks = {
  async database() {
    const start = Date.now();
    await db.query('SELECT 1');
    return { status: 'healthy', responseTime: Date.now() - start };
  },
  async redis() {
    const start = Date.now();
    await redis.ping();
    return { status: 'healthy', responseTime: Date.now() - start };
  }
};

router.get('/health/live', (req, res) => {
  res.json({ status: 'alive', uptime: process.uptime(), pid: process.pid });
});

router.get('/health/ready', async (req, res) => {
  const results = {};
  let overallStatus = 'healthy';

  for (const [name, checkFn] of Object.entries(checks)) {
    try {
      results[name] = await checkFn();
    } catch (err) {
      results[name] = { status: 'unhealthy', error: err.message };
      overallStatus = 'unhealthy';
    }
  }

  const statusCode = overallStatus === 'healthy' ? 200 : 503;
  res.status(statusCode).json({ status: overallStatus, checks: results });
});

module.exports = router;
```

---

## Python Health Checks

### Flask with flask-healthz

```bash
pip install flask flask-healthz
```

```python
# app.py
from flask import Flask
from flask_healthz import healthz, HealthError
import redis
import psycopg2
import time

app = Flask(__name__)
app.register_blueprint(healthz, url_prefix="/health")

def liveness():
    """Process is alive -- no dependency checks."""
    pass  # If this runs without exception, the probe passes

def readiness():
    """All dependencies reachable."""
    _check_database()
    _check_redis()

def _check_database():
    try:
        conn = psycopg2.connect(app.config["DATABASE_URL"])
        cur = conn.cursor()
        cur.execute("SELECT 1")
        cur.close()
        conn.close()
    except Exception as e:
        raise HealthError(f"Database unreachable: {e}")

def _check_redis():
    try:
        r = redis.from_url(app.config["REDIS_URL"])
        start = time.time()
        r.ping()
        duration = time.time() - start
        if duration > 2.0:
            raise HealthError(f"Redis degraded: {duration:.2f}s response time")
    except redis.ConnectionError as e:
        raise HealthError(f"Redis unreachable: {e}")

app.config["HEALTHZ"] = {
    "live": liveness,
    "ready": readiness,
}
```

### FastAPI with Custom Health Endpoints

```python
# health.py
from fastapi import FastAPI, Response
import asyncio
import time
from enum import Enum

app = FastAPI()

class HealthStatus(str, Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"

async def check_database():
    try:
        start = time.time()
        await database.execute("SELECT 1")
        duration = time.time() - start
        if duration > 1.0:
            return {"status": HealthStatus.DEGRADED, "responseTime": f"{duration:.3f}s"}
        return {"status": HealthStatus.HEALTHY, "responseTime": f"{duration:.3f}s"}
    except Exception as e:
        return {"status": HealthStatus.UNHEALTHY, "error": str(e)}

async def check_redis():
    try:
        start = time.time()
        await redis_client.ping()
        duration = time.time() - start
        if duration > 0.5:
            return {"status": HealthStatus.DEGRADED, "responseTime": f"{duration:.3f}s"}
        return {"status": HealthStatus.HEALTHY, "responseTime": f"{duration:.3f}s"}
    except Exception as e:
        return {"status": HealthStatus.UNHEALTHY, "error": str(e)}

@app.get("/health/live")
async def liveness():
    """Liveness probe -- no dependency checks."""
    return {"status": "alive", "uptime": time.time() - app.state.start_time}

@app.get("/health/ready")
async def readiness(response: Response):
    """Readiness probe -- check all dependencies concurrently."""
    results = await asyncio.gather(
        check_database(),
        check_redis(),
        return_exceptions=True,
    )

    checks = {
        "database": results[0] if not isinstance(results[0], Exception)
                    else {"status": "unhealthy", "error": str(results[0])},
        "redis": results[1] if not isinstance(results[1], Exception)
                 else {"status": "unhealthy", "error": str(results[1])},
    }

    statuses = [c["status"] for c in checks.values()]
    if HealthStatus.UNHEALTHY in statuses:
        overall = HealthStatus.UNHEALTHY
        response.status_code = 503
    elif HealthStatus.DEGRADED in statuses:
        overall = HealthStatus.DEGRADED
        response.status_code = 200  # Still accept traffic but signal degradation
    else:
        overall = HealthStatus.HEALTHY

    return {"status": overall, "checks": checks}

@app.get("/health/startup")
async def startup():
    """Startup probe -- verify initialization is complete."""
    if not getattr(app.state, "initialized", False):
        return Response(status_code=503, content="Initializing")
    return {"status": "started"}
```

---

## Kubernetes Probe Configuration

### Standard Deployment Spec

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: matching-engine
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: app
        image: acrsourcingcandidate.azurecr.io/matching-engine:latest
        ports:
        - containerPort: 8080

        # Startup probe -- gives the app up to 5 minutes to start
        # (failureThreshold * periodSeconds = 30 * 10 = 300s)
        # Liveness and readiness probes are disabled until startup succeeds.
        startupProbe:
          httpGet:
            path: /health/startup
            port: 8080
          failureThreshold: 30
          periodSeconds: 10
          timeoutSeconds: 5

        # Liveness probe -- restart container if process is stuck
        # No dependency checks -- only verifies the process responds.
        livenessProbe:
          httpGet:
            path: /health/live
            port: 8080
          initialDelaySeconds: 0    # Startup probe handles the delay
          periodSeconds: 15
          timeoutSeconds: 5
          failureThreshold: 3       # Restart after 3 consecutive failures

        # Readiness probe -- remove from service if dependencies are down
        # Checks database, cache, message queue connectivity.
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 8080
          initialDelaySeconds: 0
          periodSeconds: 10
          timeoutSeconds: 5
          successThreshold: 1       # One success to be marked ready
          failureThreshold: 3       # Three failures to be removed from endpoints
```

### Probe Tuning Guidelines

| Parameter | Liveness | Readiness | Startup |
|-----------|----------|-----------|---------|
| `periodSeconds` | 10-30s | 5-15s | 5-10s |
| `timeoutSeconds` | 3-5s | 3-5s | 5-10s |
| `failureThreshold` | 3-5 | 2-3 | 20-60 |
| `successThreshold` | 1 (fixed) | 1-2 | 1 (fixed) |
| `initialDelaySeconds` | 0 (use startup probe) | 0 (use startup probe) | 0 |

**Common mistakes to avoid:**
- Do NOT check external dependencies in the liveness probe -- a database outage should not cause cascading pod restarts across the cluster.
- Do NOT set `initialDelaySeconds` too low without a startup probe -- the app may get killed before it finishes booting.
- Do NOT set `timeoutSeconds` higher than `periodSeconds` -- probes will overlap.
- Do NOT return detailed error messages on public endpoints -- restrict `/health` detail to internal networks.

---

## Degraded State Reporting

Degraded status means the service is operational but experiencing issues (slow dependency, partial functionality). This is distinct from unhealthy.

**Status mapping to HTTP codes:**

| Health Status | HTTP Code | Probe Result | Action |
|---------------|-----------|-------------|--------|
| Healthy | 200 | Pass | Normal operation |
| Degraded | 200 | Pass | Alert ops team, service still accepts traffic |
| Unhealthy | 503 | Fail | Readiness probe fails, pod removed from endpoints |

**When to report Degraded:**
- A dependency responds but is slow (above threshold).
- A non-critical dependency is down (e.g., recommendation engine) while core functionality works.
- Cache miss rate is high (falling back to database).
- Connection pool usage above 80%.

---

## JSON Response Format

```json
{
  "status": "Degraded",
  "totalDuration": "00:00:00.1234567",
  "checks": [
    {
      "name": "sqlserver",
      "status": "Healthy",
      "duration": "12ms",
      "data": {}
    },
    {
      "name": "redis",
      "status": "Degraded",
      "duration": "2145ms",
      "description": "Response time above 2000ms threshold",
      "data": { "responseTime": 2145 }
    },
    {
      "name": "cosmosdb",
      "status": "Healthy",
      "duration": "45ms",
      "data": { "database": "CandidateMatching", "containers": 3 }
    },
    {
      "name": "rabbitmq",
      "status": "Healthy",
      "duration": "8ms",
      "data": {}
    }
  ]
}
```
