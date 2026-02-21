---
name: add-application-insights
description: Add Application Insights telemetry for Azure-hosted applications
---

# Add Application Insights Telemetry

Instrument Azure-hosted applications with Application Insights for distributed tracing, live metrics, custom telemetry, and intelligent alerting across .NET 8, Node.js, and Python stacks.

---

## 1. .NET 8 Integration

### 1.1 Package Installation

```bash
dotnet add package Microsoft.ApplicationInsights.AspNetCore --version 2.22.*
dotnet add package Microsoft.ApplicationInsights.Kubernetes --version 6.*   # for AKS workloads
```

### 1.2 Service Registration in Program.cs

```csharp
using Microsoft.ApplicationInsights.Extensibility;
using Microsoft.ApplicationInsights.Channel;

var builder = WebApplication.CreateBuilder(args);

// Primary registration -- reads APPLICATIONINSIGHTS_CONNECTION_STRING from env/config
builder.Services.AddApplicationInsightsTelemetry(options =>
{
    options.ConnectionString = builder.Configuration["ApplicationInsights:ConnectionString"];
    options.EnableAdaptiveSampling = true;
    options.EnableDependencyTrackingTelemetryModule = true;
    options.EnableRequestTrackingTelemetryModule = true;
    options.EnableEventCounterCollectionModule = true;
});

// Register custom components
builder.Services.AddSingleton<ITelemetryInitializer, ServiceTelemetryInitializer>();
builder.Services.AddApplicationInsightsTelemetryProcessor<HealthCheckFilterProcessor>();
builder.Services.AddApplicationInsightsKubernetesEnricher(); // AKS pod metadata

var app = builder.Build();
```

### 1.3 Custom TelemetryInitializer

Attach contextual properties to every telemetry item automatically.

```csharp
using Microsoft.ApplicationInsights.Channel;
using Microsoft.ApplicationInsights.Extensibility;

public class ServiceTelemetryInitializer : ITelemetryInitializer
{
    public void Initialize(ITelemetry telemetry)
    {
        telemetry.Context.Cloud.RoleName = "matching-engine-api";
        telemetry.Context.Cloud.RoleInstance = Environment.MachineName;

        if (telemetry is ISupportProperties props)
        {
            props.Properties.TryAdd("Environment",
                Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Unknown");
            props.Properties.TryAdd("DeploymentSlot",
                Environment.GetEnvironmentVariable("DEPLOYMENT_SLOT") ?? "primary");
            props.Properties.TryAdd("ServiceVersion",
                typeof(ServiceTelemetryInitializer).Assembly
                    .GetCustomAttribute<System.Reflection.AssemblyInformationalVersionAttribute>()
                    ?.InformationalVersion ?? "0.0.0");
        }
    }
}
```

### 1.4 TelemetryProcessor for Filtering

Suppress noisy telemetry (health probes, synthetic traffic) before it leaves the process.

```csharp
using Microsoft.ApplicationInsights.Channel;
using Microsoft.ApplicationInsights.Extensibility;
using Microsoft.ApplicationInsights.DataContracts;

public class HealthCheckFilterProcessor : ITelemetryProcessor
{
    private readonly ITelemetryProcessor _next;

    public HealthCheckFilterProcessor(ITelemetryProcessor next)
    {
        _next = next;
    }

    public void Process(ITelemetry item)
    {
        if (item is RequestTelemetry request)
        {
            if (request.Url?.AbsolutePath != null &&
                (request.Url.AbsolutePath.StartsWith("/health", StringComparison.OrdinalIgnoreCase) ||
                 request.Url.AbsolutePath.StartsWith("/liveness", StringComparison.OrdinalIgnoreCase) ||
                 request.Url.AbsolutePath.StartsWith("/readiness", StringComparison.OrdinalIgnoreCase)))
            {
                return; // Do not forward -- item is dropped
            }
        }

        if (!string.IsNullOrEmpty(item.Context.Operation.SyntheticSource))
        {
            return;
        }

        _next.Process(item);
    }
}
```

### 1.5 Custom Metrics in .NET

```csharp
using Microsoft.ApplicationInsights;
using Microsoft.ApplicationInsights.Metrics;

public class MatchingScoreService
{
    private readonly TelemetryClient _telemetry;

    public MatchingScoreService(TelemetryClient telemetry)
    {
        _telemetry = telemetry;
    }

    public async Task<MatchResult> ScoreCandidateAsync(Guid candidateId, Guid jobId)
    {
        var stopwatch = Stopwatch.StartNew();
        var result = await ComputeMatchAsync(candidateId, jobId);
        stopwatch.Stop();

        _telemetry.GetMetric("MatchingScore").TrackValue(result.OverallScore);
        _telemetry.GetMetric("MatchingDuration_ms").TrackValue(stopwatch.ElapsedMilliseconds);

        var scoreByCategoryMetric = _telemetry.GetMetric("MatchingScore", "JobCategory");
        scoreByCategoryMetric.TrackValue(result.OverallScore, result.JobCategory);

        _telemetry.TrackEvent("CandidateMatched", new Dictionary<string, string>
        {
            ["CandidateId"] = candidateId.ToString(),
            ["JobId"] = jobId.ToString(),
            ["Tier"] = result.OverallScore >= 0.8 ? "High"
                     : result.OverallScore >= 0.5 ? "Medium" : "Low"
        }, new Dictionary<string, double>
        {
            ["Score"] = result.OverallScore,
            ["Duration_ms"] = stopwatch.ElapsedMilliseconds,
            ["SkillMatchCount"] = result.MatchedSkills.Count
        });

        return result;
    }
}
```

---

## 2. Node.js Integration

### 2.1 Setup

```bash
npm install applicationinsights --save
```

The SDK must be initialized before any other imports to auto-collect dependencies.

```typescript
// instrumentation.ts -- import this FIRST in your entry point
import appInsights from "applicationinsights";

appInsights.setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING)
    .setAutoCollectRequests(true)
    .setAutoCollectPerformance(true, true)
    .setAutoCollectExceptions(true)
    .setAutoCollectDependencies(true)
    .setAutoCollectConsole(true, true)
    .setUseDiskRetryCaching(true)
    .setSendLiveMetrics(true)
    .setDistributedTracingMode(appInsights.DistributedTracingModes.AI_AND_W3C)
    .setAutoCollectHeartbeat(true)
    .start();

appInsights.defaultClient.context.tags[
    appInsights.defaultClient.context.keys.cloudRole
] = "matching-engine-frontend";

export default appInsights;
```

### 2.2 Custom Telemetry in Node.js

```typescript
import appInsights from "./instrumentation";

const client = appInsights.defaultClient;

client.trackEvent({
    name: "CandidateSearchExecuted",
    properties: { searchType: "skills-based", region: "ile-de-france" },
    measurements: { resultCount: 47, latencyMs: 230 },
});

client.trackMetric({ name: "SearchResultCount", value: 47 });

client.trackDependency({
    target: "cosmosdb-sourcing-candidate-attraction-core",
    name: "QueryCandidatesBySkill",
    data: "SELECT * FROM c WHERE ARRAY_CONTAINS(c.skills, @skill)",
    duration: 45,
    resultCode: 200,
    success: true,
    dependencyTypeName: "Azure DocumentDB",
});

client.trackTrace({ message: "Matching pipeline started", severity: 1 });
```

---

## 3. Python Integration

### 3.1 Setup with OpenCensus

```bash
pip install opencensus-ext-azure opencensus-ext-requests opencensus-ext-logging
```

### 3.2 Configuration

```python
import logging
import os
from opencensus.ext.azure.log_exporter import AzureLogHandler
from opencensus.ext.azure.trace_exporter import AzureExporter
from opencensus.ext.azure import metrics_exporter
from opencensus.trace.tracer import Tracer
from opencensus.trace.samplers import ProbabilitySampler

CONNECTION_STRING = os.environ["APPLICATIONINSIGHTS_CONNECTION_STRING"]

logger = logging.getLogger(__name__)
logger.addHandler(AzureLogHandler(connection_string=CONNECTION_STRING))
logger.setLevel(logging.INFO)

tracer = Tracer(
    exporter=AzureExporter(connection_string=CONNECTION_STRING),
    sampler=ProbabilitySampler(rate=1.0),
)

exporter = metrics_exporter.new_metrics_exporter(
    connection_string=CONNECTION_STRING,
    export_interval=60,
)

from opencensus.stats import aggregation, measure, view
from opencensus.stats import stats as ocstats

matching_latency = measure.MeasureFloat(
    "matching_latency_ms", "Matching latency in ms", "ms"
)
latency_view = view.View(
    "matching_latency_distribution",
    "Distribution of matching latency",
    [],
    matching_latency,
    aggregation.DistributionAggregation([25, 50, 100, 250, 500, 1000]),
)
ocstats.stats.view_manager.register_view(latency_view)

mmap = ocstats.stats.stats_recorder.new_measurement_map()
mmap.measure_float_put(matching_latency, 87.5)
mmap.record()
```

---

## 4. Sampling Configuration

Sampling reduces telemetry volume and cost while preserving statistical accuracy.

### 4.1 Adaptive Sampling (.NET)

Enabled by default with `AddApplicationInsightsTelemetry()`. Fine-tune limits:

```csharp
builder.Services.Configure<TelemetryConfiguration>(config =>
{
    var chainBuilder = config.DefaultTelemetrySink.TelemetryProcessorChainBuilder;

    chainBuilder.UseAdaptiveSampling(
        maxTelemetryItemsPerSecond: 5,
        excludedTypes: "Event;Trace"
    );

    chainBuilder.Build();
});
```

### 4.2 Fixed-Rate Sampling (.NET)

For predictable billing, use fixed-rate instead of adaptive:

```csharp
builder.Services.Configure<TelemetryConfiguration>(config =>
{
    var chainBuilder = config.DefaultTelemetrySink.TelemetryProcessorChainBuilder;

    chainBuilder.UseSampling(25.0); // Keep 25% of telemetry
    chainBuilder.Build();
});
```

### 4.3 Ingestion Sampling (Portal-Side)

Configure in Azure Portal under Application Insights > Usage and estimated costs > Data sampling.
This applies after data is received, reducing storage cost without changing SDK behavior.

---

## 5. Connection String Management

Never hardcode connection strings. Use environment variables and Azure Key Vault.

### 5.1 appsettings.json (local development only)

```json
{
  "ApplicationInsights": {
    "ConnectionString": "InstrumentationKey=00000000-0000-0000-0000-000000000000;IngestionEndpoint=https://westeurope-5.in.applicationinsights.azure.com/"
  }
}
```

### 5.2 Azure Key Vault Integration

```csharp
builder.Configuration.AddAzureKeyVault(
    new Uri("https://kv-sourcing-candidate.vault.azure.net/"),
    new DefaultAzureCredential());
// Secret name: ApplicationInsights--ConnectionString
// Azure automatically maps "--" to ":" in configuration hierarchy
```

### 5.3 Kubernetes Secret + Environment Variable

```yaml
env:
  - name: APPLICATIONINSIGHTS_CONNECTION_STRING
    valueFrom:
      secretKeyRef:
        name: appinsights-secret
        key: connection-string
```

The .NET SDK reads `APPLICATIONINSIGHTS_CONNECTION_STRING` automatically when no explicit
value is provided in code.

---

## 6. Dependency Tracking

Application Insights auto-collects calls to:
- HTTP/HTTPS endpoints (HttpClient, RestSharp)
- SQL Server, Azure SQL
- Azure Storage (Blob, Queue, Table)
- Azure Service Bus, Event Hubs
- Azure Cosmos DB
- Redis Cache

### 6.1 Enriching Dependency Telemetry

```csharp
public class DependencyEnricherProcessor : ITelemetryProcessor
{
    private readonly ITelemetryProcessor _next;

    public DependencyEnricherProcessor(ITelemetryProcessor next) => _next = next;

    public void Process(ITelemetry item)
    {
        if (item is DependencyTelemetry dep)
        {
            if (dep.Type == "Azure DocumentDB")
                dep.Properties["DatabaseTier"] = "CosmosDB-Standard";

            if (dep.Duration > TimeSpan.FromMilliseconds(500))
                dep.Properties["PerformanceFlag"] = "Slow";
        }

        _next.Process(item);
    }
}
```

---

## 7. Application Map

Application Map auto-discovers topology from dependency telemetry. For accurate grouping:

1. Set `Cloud.RoleName` distinctly per microservice (via TelemetryInitializer).
2. Set `Cloud.RoleInstance` to differentiate pod/container replicas.
3. Ensure distributed tracing headers propagate (`traceparent` W3C header) across service boundaries.

The map renders in Azure Portal under Application Insights > Application Map. Each node
represents a `RoleName`, edges represent dependency calls with latency and failure rates.

---

## 8. Live Metrics Stream

Real-time view of incoming requests, failures, and performance counters with no sampling applied.

### .NET -- Enabled by Default

`AddApplicationInsightsTelemetry()` includes `LiveMetricsServiceModule`. No extra
configuration needed. Access at Azure Portal > Application Insights > Live Metrics.

### Node.js

Enabled via `.setSendLiveMetrics(true)` in the setup call (shown in Section 2.1).

### Secure Live Metrics with Authentication

```csharp
builder.Services.ConfigureTelemetryModule<QuickPulseTelemetryModule>((module, _) =>
{
    module.AuthenticationApiKey =
        builder.Configuration["ApplicationInsights:QuickPulseApiKey"];
});
```

---

## 9. Availability Tests

Monitor endpoint availability from multiple Azure regions.

### 9.1 URL Ping Test (Portal)

Configure in Application Insights > Availability > Add Standard Test:
- URL: `https://api.matching-engine.example.com/health`
- Frequency: 300 seconds
- Test locations: West Europe, North Europe, UK South
- Success criteria: HTTP 200, response time < 5s

### 9.2 Multi-Step Availability Test (TrackAvailability API)

```csharp
public class MatchingEndpointAvailabilityTest : BackgroundService
{
    private readonly TelemetryClient _telemetry;
    private readonly HttpClient _httpClient;

    public MatchingEndpointAvailabilityTest(
        TelemetryClient telemetry, IHttpClientFactory httpClientFactory)
    {
        _telemetry = telemetry;
        _httpClient = httpClientFactory.CreateClient("AvailabilityTest");
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var availability = new AvailabilityTelemetry
            {
                Name = "MatchingAPI-HealthCheck",
                RunLocation = "InternalCluster",
                Success = false,
            };

            var stopwatch = Stopwatch.StartNew();

            try
            {
                var response = await _httpClient.GetAsync("/health", stoppingToken);
                availability.Success = response.IsSuccessStatusCode;
                availability.Message = $"HTTP {(int)response.StatusCode}";
            }
            catch (Exception ex)
            {
                availability.Message = ex.Message;
            }
            finally
            {
                stopwatch.Stop();
                availability.Duration = stopwatch.Elapsed;
                _telemetry.TrackAvailability(availability);
            }

            await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
        }
    }
}
```

---

## 10. Kusto Queries (KQL) for Common Investigations

```kql
// Slow matching requests (P95 latency)
requests
| where name startswith "POST /api/matching"
| summarize percentile(duration, 95) by bin(timestamp, 1h)
| render timechart

// Failed dependencies by type
dependencies
| where success == false
| summarize count() by type, target, bin(timestamp, 1h)
| order by count_ desc

// Custom matching score distribution
customMetrics
| where name == "MatchingScore"
| summarize avg(value), percentile(value, 50), percentile(value, 95) by bin(timestamp, 1h)
| render timechart

// End-to-end transaction search
union requests, dependencies, exceptions, traces
| where operation_Id == "TARGET_OPERATION_ID"
| order by timestamp asc
```

---

## Checklist

- [ ] Connection string stored in Key Vault, referenced via env var or config
- [ ] `Cloud.RoleName` set per microservice for Application Map accuracy
- [ ] Health/liveness endpoints filtered via TelemetryProcessor
- [ ] Sampling configured (adaptive or fixed-rate) for cost control
- [ ] Custom metrics defined for domain-specific KPIs
- [ ] Live Metrics Stream verified in portal
- [ ] Availability tests configured from multiple Azure regions
- [ ] KQL alerts created for error rate spikes and latency degradation
