---
name: setup-error-tracking
description: Setup error tracking with Sentry for real-time crash reporting
---
# Setup Error Tracking with Sentry

Comprehensive guide for integrating Sentry error tracking across .NET 8, Node.js, Python, and React applications. Covers SDK initialization, breadcrumbs, user context, release tracking, source maps, performance monitoring, issue grouping, alert rules, and PII scrubbing.

---

## 1. .NET 8 (ASP.NET Core)

### Installation

```bash
dotnet add package Sentry.AspNetCore --version 4.*
```

### SDK Initialization in Program.cs

```csharp
using Sentry;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.UseSentry(options =>
{
    options.Dsn = builder.Configuration["Sentry:Dsn"];
    options.Environment = builder.Environment.EnvironmentName;
    options.Release = $"myapp@{typeof(Program).Assembly.GetName().Version}";
    options.TracesSampleRate = builder.Environment.IsProduction() ? 0.2 : 1.0;
    options.ProfilesSampleRate = 0.1;
    options.SendDefaultPii = false;
    options.MaxBreadcrumbs = 50;
    options.AttachStacktrace = true;
    options.AutoSessionTracking = true;
    options.IsGlobalModeEnabled = true;

    // PII scrubbing - strip sensitive headers and cookies
    options.SetBeforeSend((sentryEvent, hint) =>
    {
        sentryEvent.ServerName = null;
        if (sentryEvent.Request?.Headers != null)
        {
            var sanitized = new Dictionary<string, string>(sentryEvent.Request.Headers);
            sanitized.Remove("Authorization");
            sanitized.Remove("Cookie");
            sanitized.Remove("X-Api-Key");
            sentryEvent.Request.Headers = sanitized;
        }
        return sentryEvent;
    });

    // Custom fingerprinting for issue grouping
    options.SetBeforeSend((sentryEvent, hint) =>
    {
        if (sentryEvent.Exception is HttpRequestException)
        {
            sentryEvent.SetFingerprint(new[] { "http-request-failure", sentryEvent.Request?.Url ?? "unknown" });
        }
        return sentryEvent;
    });
});

builder.Services.AddSingleton<ISentryClient>(sp => SentrySdk.CurrentHub as ISentryClient);

var app = builder.Build();

app.UseSentryTracing();

app.Use(async (context, next) =>
{
    // Attach user context from authenticated principal
    if (context.User.Identity?.IsAuthenticated == true)
    {
        SentrySdk.ConfigureScope(scope =>
        {
            scope.User = new SentryUser
            {
                Id = context.User.FindFirst("sub")?.Value,
                Email = context.User.FindFirst("email")?.Value,
                Username = context.User.Identity.Name
            };
        });
    }
    await next();
});

app.Run();
```

### Adding Breadcrumbs in Services

```csharp
public class OrderService
{
    public async Task<Order> ProcessOrderAsync(string orderId)
    {
        SentrySdk.AddBreadcrumb(
            message: $"Processing order {orderId}",
            category: "order.process",
            level: BreadcrumbLevel.Info,
            data: new Dictionary<string, string> { ["orderId"] = orderId }
        );

        try
        {
            var result = await _repository.GetOrderAsync(orderId);
            SentrySdk.AddBreadcrumb("Order fetched from database", "order.fetch", level: BreadcrumbLevel.Info);
            return result;
        }
        catch (Exception ex)
        {
            SentrySdk.CaptureException(ex);
            throw;
        }
    }
}
```

---

## 2. Node.js (Express / Fastify)

### Installation

```bash
npm install @sentry/node @sentry/tracing --save
```

### SDK Initialization (instrument.js - load before app)

```javascript
const Sentry = require("@sentry/node");
const { nodeProfilingIntegration } = require("@sentry/profiling-node");

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "development",
  release: `myapp@${process.env.npm_package_version}`,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
  profilesSampleRate: 0.1,
  integrations: [
    nodeProfilingIntegration(),
  ],
  maxBreadcrumbs: 50,
  sendDefaultPii: false,

  // PII scrubbing - remove sensitive data before sending
  beforeSend(event) {
    if (event.request?.headers) {
      delete event.request.headers["authorization"];
      delete event.request.headers["cookie"];
      delete event.request.headers["x-api-key"];
    }
    if (event.request?.query_string) {
      event.request.query_string = event.request.query_string
        .replace(/token=[^&]*/g, "token=[FILTERED]")
        .replace(/password=[^&]*/g, "password=[FILTERED]");
    }
    if (event.user?.ip_address) {
      delete event.user.ip_address;
    }
    return event;
  },
});
```

### Express Middleware Setup

```javascript
const express = require("express");
const Sentry = require("@sentry/node");

const app = express();

// Sentry request handler must be first middleware
Sentry.setupExpressErrorHandler(app);

// User context middleware - attach after authentication
app.use((req, res, next) => {
  if (req.user) {
    Sentry.setUser({
      id: req.user.id,
      email: req.user.email,
      username: req.user.name,
    });
  }
  next();
});

// Breadcrumbs in route handlers
app.get("/api/orders/:id", async (req, res) => {
  Sentry.addBreadcrumb({
    category: "order.fetch",
    message: `Fetching order ${req.params.id}`,
    level: "info",
    data: { orderId: req.params.id },
  });

  try {
    const order = await orderService.getById(req.params.id);
    res.json(order);
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({ error: "Internal server error" });
  }
});
```

### Custom Fingerprinting (Node.js)

```javascript
Sentry.withScope((scope) => {
  scope.setFingerprint(["timeout-error", req.originalUrl]);
  Sentry.captureException(error);
});
```

---

## 3. Python (FastAPI / Flask / Django)

### Installation

```bash
pip install sentry-sdk[fastapi]   # or sentry-sdk[flask] or sentry-sdk[django]
```

### SDK Initialization

```python
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
import os


def scrub_pii(event, hint):
    """Remove personally identifiable information before sending to Sentry."""
    if "request" in event and "headers" in event["request"]:
        headers = event["request"]["headers"]
        for sensitive_key in ["Authorization", "Cookie", "X-Api-Key"]:
            headers.pop(sensitive_key, None)
    if "user" in event and "ip_address" in event.get("user", {}):
        del event["user"]["ip_address"]
    return event


sentry_sdk.init(
    dsn=os.environ["SENTRY_DSN"],
    environment=os.environ.get("SENTRY_ENVIRONMENT", "development"),
    release=f"myapp@{os.environ.get('APP_VERSION', '0.0.0')}",
    traces_sample_rate=0.2 if os.environ.get("SENTRY_ENVIRONMENT") == "production" else 1.0,
    profiles_sample_rate=0.1,
    max_breadcrumbs=50,
    send_default_pii=False,
    integrations=[
        FastApiIntegration(transaction_style="endpoint"),
        SqlalchemyIntegration(),
    ],
    before_send=scrub_pii,
)
```

### User Context and Breadcrumbs

```python
from sentry_sdk import set_user, add_breadcrumb, capture_exception

# Middleware for user context (FastAPI)
@app.middleware("http")
async def sentry_user_context(request: Request, call_next):
    if hasattr(request.state, "user") and request.state.user:
        set_user({
            "id": str(request.state.user.id),
            "email": request.state.user.email,
            "username": request.state.user.name,
        })
    response = await call_next(request)
    return response

# Breadcrumbs in service layer
async def process_order(order_id: str):
    add_breadcrumb(
        category="order.process",
        message=f"Processing order {order_id}",
        level="info",
        data={"order_id": order_id},
    )
    try:
        result = await order_repository.get(order_id)
        add_breadcrumb(category="order.fetch", message="Order retrieved", level="info")
        return result
    except Exception as e:
        capture_exception(e)
        raise
```

---

## 4. React (@sentry/react with ErrorBoundary)

### Installation

```bash
npm install @sentry/react --save
```

### SDK Initialization (sentry.ts)

```typescript
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || "development",
  release: `myapp-frontend@${import.meta.env.VITE_APP_VERSION}`,
  tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  maxBreadcrumbs: 50,
  sendDefaultPii: false,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // PII scrubbing - strip tokens from URLs and user data
  beforeSend(event) {
    if (event.request?.url) {
      event.request.url = event.request.url.replace(/token=[^&]*/g, "token=[FILTERED]");
    }
    if (event.user) {
      delete event.user.ip_address;
    }
    return event;
  },

  // Ignore non-actionable errors
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "Network request failed",
    /Loading chunk \d+ failed/,
  ],
});
```

### ErrorBoundary Integration

```tsx
import * as Sentry from "@sentry/react";

function FallbackComponent({ error, resetError }: { error: Error; resetError: () => void }) {
  return (
    <div role="alert" style={{ padding: "2rem", textAlign: "center" }}>
      <h2>Something went wrong</h2>
      <p>{error.message}</p>
      <button onClick={resetError}>Try Again</button>
    </div>
  );
}

// Wrap app or individual sections
function App() {
  return (
    <Sentry.ErrorBoundary
      fallback={({ error, resetError }) => (
        <FallbackComponent error={error} resetError={resetError} />
      )}
      showDialog={false}
      beforeCapture={(scope) => {
        scope.setTag("location", "app-root");
      }}
    >
      <Router>
        <Routes />
      </Router>
    </Sentry.ErrorBoundary>
  );
}
```

### User Context Hook

```tsx
import * as Sentry from "@sentry/react";
import { useEffect } from "react";
import { useAuth } from "./hooks/useAuth";

export function useSentryUser() {
  const { user, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated && user) {
      Sentry.setUser({
        id: user.id,
        email: user.email,
        username: user.displayName,
      });
    } else {
      Sentry.setUser(null);
    }
  }, [user, isAuthenticated]);
}
```

### Breadcrumbs in Components

```tsx
function OrderDetail({ orderId }: { orderId: string }) {
  useEffect(() => {
    Sentry.addBreadcrumb({
      category: "navigation",
      message: `Viewed order ${orderId}`,
      level: "info",
      data: { orderId },
    });
  }, [orderId]);

  const handleSubmit = () => {
    Sentry.addBreadcrumb({
      category: "user.action",
      message: "Order form submitted",
      level: "info",
    });
    // submit logic
  };

  return <form onSubmit={handleSubmit}>{/* form fields */}</form>;
}
```

---

## 5. Source Maps Upload (CI/CD)

### Vite / Webpack - sentry-cli in Pipeline

```bash
# Install sentry-cli
npm install @sentry/cli --save-dev

# Upload source maps during build
npx sentry-cli releases new "$RELEASE_VERSION"
npx sentry-cli releases files "$RELEASE_VERSION" upload-sourcemaps ./dist \
  --url-prefix "~/static/js" \
  --rewrite
npx sentry-cli releases finalize "$RELEASE_VERSION"

# Clean source maps from deployed artifacts (do not ship to production)
find ./dist -name "*.map" -delete
```

### Vite Plugin (Alternative)

```typescript
// vite.config.ts
import { sentryVitePlugin } from "@sentry/vite-plugin";

export default defineConfig({
  build: { sourcemap: true },
  plugins: [
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: { name: process.env.VITE_APP_VERSION },
      sourcemaps: { filesToDeleteAfterUpload: ["./dist/**/*.map"] },
    }),
  ],
});
```

---

## 6. Release Tracking

Tag every deploy so Sentry correlates errors with specific versions.

```bash
# Create release (run in CI after build succeeds)
export SENTRY_RELEASE="myapp@$(git describe --tags --always)"
sentry-cli releases new "$SENTRY_RELEASE"
sentry-cli releases set-commits "$SENTRY_RELEASE" --auto
sentry-cli releases finalize "$SENTRY_RELEASE"

# Mark deployment after successful rollout
sentry-cli releases deploys "$SENTRY_RELEASE" new \
  --env production \
  --started "$(date -u +%s)" \
  --finished "$(date -u +%s)"
```

---

## 7. Performance Monitoring

### Transaction Spans (.NET 8 Example)

```csharp
public async Task<MatchResult> MatchCandidateAsync(string candidateId, string jobId)
{
    var transaction = SentrySdk.StartTransaction("match-candidate", "matching.engine");
    SentrySdk.ConfigureScope(scope => scope.Transaction = transaction);

    var spanFetch = transaction.StartChild("db.query", "Fetch candidate profile");
    var candidate = await _candidateRepo.GetByIdAsync(candidateId);
    spanFetch.Finish();

    var spanScore = transaction.StartChild("compute", "Calculate matching score");
    var score = _scoringEngine.Calculate(candidate, jobId);
    spanScore.Finish();

    var spanPersist = transaction.StartChild("db.write", "Persist match result");
    await _matchResultRepo.SaveAsync(score);
    spanPersist.Finish();

    transaction.Finish();
    return score;
}
```

### Custom Metrics

```csharp
// Track matching engine latency as a distribution metric
SentrySdk.Metrics.Distribution("matching.latency_ms",
    value: stopwatch.ElapsedMilliseconds,
    unit: MeasurementUnit.Duration.Millisecond,
    tags: new Dictionary<string, string> { ["engine"] = "experience" }
);
```

---

## 8. Issue Grouping Configuration

Configure in Sentry project settings or via SDK fingerprints.

### Server-side Fingerprint Rules (Sentry UI > Settings > Issue Grouping)

```
# Group all timeout errors by endpoint
family:javascript type:TimeoutError -> timeout-error {{ request.url }}

# Group database connection errors together regardless of message
family:csharp message:"A connection attempt failed" -> db-connection-failure

# Group all 429 rate-limit responses
family:* status_code:429 -> rate-limit-exceeded
```

### SDK-side Custom Fingerprinting

```javascript
Sentry.withScope((scope) => {
  scope.setFingerprint(["payment-gateway", gatewayName, errorCode]);
  Sentry.captureException(error);
});
```

---

## 9. Alert Rules Configuration

Create in Sentry UI or via API. Example alert rule payload:

```json
{
  "name": "High Error Rate - Production",
  "conditions": [
    {
      "id": "sentry.rules.conditions.event_frequency.EventFrequencyCondition",
      "value": 50,
      "interval": "5m"
    }
  ],
  "filters": [
    {
      "id": "sentry.rules.filters.level.LevelFilter",
      "level": "error",
      "match": "gte"
    },
    {
      "id": "sentry.rules.filters.tagged_event.TaggedEventFilter",
      "key": "environment",
      "match": "eq",
      "value": "production"
    }
  ],
  "actions": [
    {
      "id": "sentry.integrations.slack.notify_action.SlackNotifyServiceAction",
      "channel": "#alerts-production",
      "workspace": "your-workspace-id"
    },
    {
      "id": "sentry.integrations.pagerduty.notify_action.PagerDutyNotifyServiceAction",
      "service": "your-pagerduty-service-id"
    }
  ],
  "frequency": 300,
  "environment": "production"
}
```

### Recommended Alert Rules

| Rule | Condition | Action |
|------|-----------|--------|
| Error spike | >50 events in 5 min | Slack + PagerDuty |
| New issue in production | First seen in release | Slack notification |
| Unresolved critical | P1 unresolved >30 min | PagerDuty escalation |
| Performance regression | P95 latency >2s | Slack warning |
| Release health drop | Crash-free rate <99% | Slack + email |

---

## 10. PII Scrubbing Checklist

Ensure compliance with GDPR, CNIL, and data protection regulations.

| Data Type | Scrubbing Method | Location |
|-----------|-----------------|----------|
| Authorization headers | Remove from request headers | `beforeSend` |
| Cookies | Remove from request headers | `beforeSend` |
| IP addresses | Delete `user.ip_address` | `beforeSend` |
| Query string tokens | Regex replace with `[FILTERED]` | `beforeSend` |
| Request body PII | Strip or mask fields | `beforeSend` |
| Server hostname | Set `serverName = null` | `beforeSend` |
| Email in breadcrumbs | Avoid logging emails in breadcrumb data | Application code |
| Database connection strings | Never include in tags or extra data | Application code |

### Sentry Server-side Scrubbing (Project Settings)

Enable in **Settings > Security & Privacy > Data Scrubbing**:
- Turn on **"Use Default Scrubbers"** to auto-redact credit cards, SSNs, passwords
- Add custom scrubbing rules for national ID formats (e.g., French NIR: `[12][- ]?\d{2}[- ]?\d{2}[- ]?\d{3}[- ]?\d{3}[- ]?\d{2}`)
- Enable **"Restrict IP Addresses"** to prevent storage of client IPs
