---
name: implement-distributed-tracing
description: Implement distributed tracing with OpenTelemetry across microservices
---

# Implement Distributed Tracing with OpenTelemetry

Distributed tracing tracks requests as they flow through microservices, enabling root-cause analysis
of latency, failures, and cross-service dependencies. This skill covers OpenTelemetry integration
for .NET 8, Node.js, and Python services with W3C TraceContext propagation, exporter configuration,
and production-ready sampling strategies.

---

## 1. .NET 8 Implementation

### 1.1 NuGet Packages

```xml
<ItemGroup>
  <PackageReference Include="OpenTelemetry.Extensions.Hosting" Version="1.9.*" />
  <PackageReference Include="OpenTelemetry.Instrumentation.AspNetCore" Version="1.9.*" />
  <PackageReference Include="OpenTelemetry.Instrumentation.Http" Version="1.9.*" />
  <PackageReference Include="OpenTelemetry.Instrumentation.SqlClient" Version="1.9.*" />
  <PackageReference Include="OpenTelemetry.Exporter.Jaeger" Version="1.5.*" />
  <PackageReference Include="OpenTelemetry.Exporter.OpenTelemetryProtocol" Version="1.9.*" />
</ItemGroup>
```

### 1.2 Service Registration (Program.cs)

```csharp
using OpenTelemetry;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using System.Diagnostics;

var builder = WebApplication.CreateBuilder(args);

// Define the service resource attributes for trace identification
var serviceName = builder.Configuration["OpenTelemetry:ServiceName"] ?? "matching-engine";
var serviceVersion = typeof(Program).Assembly.GetName().Version?.ToString() ?? "1.0.0";

builder.Services.AddOpenTelemetry()
    .ConfigureResource(resource => resource
        .AddService(
            serviceName: serviceName,
            serviceVersion: serviceVersion,
            serviceInstanceId: Environment.MachineName)
        .AddAttributes(new Dictionary<string, object>
        {
            ["deployment.environment"] = builder.Environment.EnvironmentName,
            ["host.name"] = Environment.MachineName
        }))
    .WithTracing(tracing =>
    {
        tracing
            // Automatic instrumentation for inbound HTTP requests
            .AddAspNetCoreInstrumentation(options =>
            {
                options.RecordException = true;
                options.Filter = httpContext =>
                    !httpContext.Request.Path.StartsWithSegments("/health");
            })
            // Automatic instrumentation for outbound HTTP calls
            .AddHttpClientInstrumentation(options =>
            {
                options.RecordException = true;
                options.FilterHttpRequestMessage = request =>
                    request.RequestUri?.Host != "login.microsoftonline.com";
            })
            // SQL Server / Azure SQL instrumentation
            .AddSqlClientInstrumentation(options =>
            {
                options.SetDbStatementForText = true;
                options.RecordException = true;
                options.SetDbStatementForStoredProcedure = true;
            })
            // Register custom ActivitySource for business operations
            .AddSource("Sourcing.CandidateAttraction.*")
            // Jaeger exporter (OTLP is preferred for production)
            .AddJaegerExporter(options =>
            {
                options.AgentHost = builder.Configuration["Jaeger:AgentHost"] ?? "localhost";
                options.AgentPort = int.Parse(
                    builder.Configuration["Jaeger:AgentPort"] ?? "6831");
            })
            // OTLP exporter (recommended for production collectors)
            .AddOtlpExporter(options =>
            {
                options.Endpoint = new Uri(
                    builder.Configuration["OpenTelemetry:OtlpEndpoint"]
                    ?? "http://localhost:4317");
            })
            // Sampling strategy
            .SetSampler(new ParentBasedSampler(
                new TraceIdRatioBasedSampler(
                    double.Parse(
                        builder.Configuration["OpenTelemetry:SamplingRatio"] ?? "1.0"))));
    });
```

### 1.3 Custom Spans for Business Operations

```csharp
using System.Diagnostics;
using OpenTelemetry;

namespace Sourcing.CandidateAttraction.Services.Matching;

public class CandidateMatchingService : ICandidateMatchingService
{
    // One ActivitySource per logical component; registered via AddSource() above
    private static readonly ActivitySource ActivitySource =
        new("Sourcing.CandidateAttraction.MatchingEngine", "1.0.0");

    public async Task<MatchResult> MatchCandidateToJobAsync(
        string candidateId, string jobId, CancellationToken ct)
    {
        // Start a custom span for the business operation
        using var activity = ActivitySource.StartActivity(
            "MatchCandidateToJob",
            ActivityKind.Internal);

        // Add semantic attributes for traceability
        activity?.SetTag("candidate.id", candidateId);
        activity?.SetTag("job.id", jobId);
        activity?.SetTag("matching.algorithm", "weighted-composite-v2");

        try
        {
            // Child span: experience scoring
            using var expActivity = ActivitySource.StartActivity("ScoreExperience");
            var experienceScore = await ScoreExperienceAsync(candidateId, jobId, ct);
            expActivity?.SetTag("score.experience", experienceScore);

            // Child span: skills scoring
            using var skillsActivity = ActivitySource.StartActivity("ScoreSkills");
            var skillsScore = await ScoreSkillsAsync(candidateId, jobId, ct);
            skillsActivity?.SetTag("score.skills", skillsScore);

            // Child span: location scoring
            using var locationActivity = ActivitySource.StartActivity("ScoreLocation");
            var locationScore = await ScoreLocationAsync(candidateId, jobId, ct);
            locationActivity?.SetTag("score.location", locationScore);

            var compositeScore = CalculateCompositeScore(
                experienceScore, skillsScore, locationScore);

            activity?.SetTag("matching.composite_score", compositeScore);
            activity?.SetTag("matching.result", compositeScore >= 0.7 ? "match" : "no_match");
            activity?.SetStatus(ActivityStatusCode.Ok);

            return new MatchResult(candidateId, jobId, compositeScore);
        }
        catch (Exception ex)
        {
            activity?.SetStatus(ActivityStatusCode.Error, ex.Message);
            activity?.RecordException(ex);
            throw;
        }
    }
}
```

### 1.4 W3C Baggage for Cross-Service Context

```csharp
using System.Diagnostics;

// Setting baggage (propagated automatically via W3C headers)
Activity.Current?.SetBaggage("tenant.id", tenantId);
Activity.Current?.SetBaggage("correlation.id", correlationId);

// Reading baggage in a downstream service
var tenantId = Activity.Current?.GetBaggageItem("tenant.id");
```

---

## 2. Node.js Implementation

### 2.1 Package Installation

```bash
npm install @opentelemetry/sdk-node \
            @opentelemetry/auto-instrumentations-node \
            @opentelemetry/exporter-jaeger \
            @opentelemetry/exporter-trace-otlp-grpc \
            @opentelemetry/resources \
            @opentelemetry/semantic-conventions \
            @opentelemetry/api
```

### 2.2 Tracing Initialization (tracing.ts)

This file must be imported before any other module to ensure instrumentation is patched early.

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { Resource } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
} from '@opentelemetry/semantic-conventions';
import { ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';

const jaegerExporter = new JaegerExporter({
  host: process.env.JAEGER_AGENT_HOST || 'localhost',
  port: parseInt(process.env.JAEGER_AGENT_PORT || '6832', 10),
});

const otlpExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317',
});

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'candidate-portal',
    [ATTR_SERVICE_VERSION]: '1.0.0',
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: process.env.NODE_ENV || 'development',
  }),
  traceExporter: otlpExporter,
  sampler: new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(
      parseFloat(process.env.OTEL_SAMPLING_RATIO || '1.0')
    ),
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingRequestHook: (req) =>
          req.url?.includes('/health') ?? false,
      },
      '@opentelemetry/instrumentation-express': { enabled: true },
      '@opentelemetry/instrumentation-pg': { enabled: true },
    }),
  ],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown().then(() => process.exit(0));
});
```

### 2.3 Custom Spans in Node.js

```typescript
import { trace, SpanStatusCode, context, propagation } from '@opentelemetry/api';

const tracer = trace.getTracer('candidate-portal', '1.0.0');

async function processApplication(candidateId: string, jobId: string) {
  return tracer.startActiveSpan('processApplication', async (span) => {
    try {
      span.setAttribute('candidate.id', candidateId);
      span.setAttribute('job.id', jobId);

      // Nested child span
      const validationResult = await tracer.startActiveSpan(
        'validateApplication',
        async (childSpan) => {
          const result = await validateCandidate(candidateId);
          childSpan.setAttribute('validation.passed', result.isValid);
          childSpan.setStatus({ code: SpanStatusCode.OK });
          childSpan.end();
          return result;
        }
      );

      span.setAttribute('application.status', 'processed');
      span.setStatus({ code: SpanStatusCode.OK });
      return validationResult;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  });
}
```

---

## 3. Python Implementation

### 3.1 Package Installation

```bash
pip install opentelemetry-api \
            opentelemetry-sdk \
            opentelemetry-exporter-jaeger \
            opentelemetry-exporter-otlp \
            opentelemetry-instrumentation-flask \
            opentelemetry-instrumentation-requests \
            opentelemetry-instrumentation-sqlalchemy
```

### 3.2 Tracing Setup

```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.resources import Resource, SERVICE_NAME, SERVICE_VERSION
from opentelemetry.exporter.jaeger.thrift import JaegerExporter
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace.sampling import ParentBasedTraceIdRatio
from opentelemetry.instrumentation.flask import FlaskInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor
import os

resource = Resource.create({
    SERVICE_NAME: os.getenv("OTEL_SERVICE_NAME", "analytics-service"),
    SERVICE_VERSION: "1.0.0",
    "deployment.environment": os.getenv("ENVIRONMENT", "development"),
})

sampling_ratio = float(os.getenv("OTEL_SAMPLING_RATIO", "1.0"))

provider = TracerProvider(
    resource=resource,
    sampler=ParentBasedTraceIdRatio(sampling_ratio),
)

# Jaeger exporter
jaeger_exporter = JaegerExporter(
    agent_host_name=os.getenv("JAEGER_AGENT_HOST", "localhost"),
    agent_port=int(os.getenv("JAEGER_AGENT_PORT", "6831")),
)
provider.add_span_processor(BatchSpanProcessor(jaeger_exporter))

# OTLP exporter (production)
otlp_exporter = OTLPSpanExporter(
    endpoint=os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317"),
)
provider.add_span_processor(BatchSpanProcessor(otlp_exporter))

trace.set_tracer_provider(provider)

# Auto-instrument Flask and outbound requests
FlaskInstrumentor().instrument()
RequestsInstrumentor().instrument()
```

### 3.3 Custom Spans in Python

```python
from opentelemetry import trace, baggage, context
from opentelemetry.trace import StatusCode

tracer = trace.get_tracer("analytics-service", "1.0.0")

def analyze_candidate_pool(job_id: str, filters: dict):
    with tracer.start_as_current_span("analyze_candidate_pool") as span:
        span.set_attribute("job.id", job_id)
        span.set_attribute("filter.count", len(filters))

        try:
            with tracer.start_as_current_span("query_candidates") as child:
                candidates = fetch_candidates(job_id, filters)
                child.set_attribute("candidates.count", len(candidates))

            with tracer.start_as_current_span("compute_rankings") as child:
                rankings = rank_candidates(candidates)
                child.set_attribute("rankings.top_score", rankings[0].score)

            span.set_status(StatusCode.OK)
            return rankings
        except Exception as ex:
            span.set_status(StatusCode.ERROR, str(ex))
            span.record_exception(ex)
            raise
```

---

## 4. W3C TraceContext Propagation

All three stacks propagate context via W3C `traceparent` and `tracestate` HTTP headers by default
when using OpenTelemetry auto-instrumentation. The header format is:

```
traceparent: 00-<trace-id>-<span-id>-<trace-flags>
tracestate:  vendor1=value1,vendor2=value2
```

Ensure all HTTP clients and servers in the mesh use the W3C propagator (the default). If migrating
from B3 propagation (Zipkin), configure a composite propagator:

```csharp
// .NET: Composite propagator for migration periods
using OpenTelemetry;
Sdk.SetDefaultTextMapPropagator(new CompositeTextMapPropagator(new TextMapPropagator[]
{
    new TraceContextPropagator(),  // W3C (primary)
    new BaggagePropagator(),       // W3C Baggage
    new B3Propagator(),            // Zipkin B3 (legacy compat)
}));
```

---

## 5. Sampling Strategies

| Strategy | Use Case | Configuration |
|----------|----------|---------------|
| **AlwaysOn** | Development, debugging | `ratio: 1.0` |
| **TraceIdRatioBased** | Production baseline | `ratio: 0.1` (10% of traces) |
| **ParentBased** | Respect upstream decisions | Wraps any root sampler |
| **Custom/RuleBased** | Sample all errors, specific endpoints | Custom sampler implementation |

### Production Recommendation

Use `ParentBasedSampler` wrapping `TraceIdRatioBasedSampler` at 10-25% for general traffic.
Override to 100% for error traces using a tail-based sampling collector (OpenTelemetry Collector
with `tailsampling` processor):

```yaml
# otel-collector-config.yaml
processors:
  tail_sampling:
    decision_wait: 10s
    policies:
      - name: error-policy
        type: status_code
        status_code: { status_codes: [ERROR] }
      - name: slow-policy
        type: latency
        latency: { threshold_ms: 2000 }
      - name: baseline
        type: probabilistic
        probabilistic: { sampling_percentage: 10 }
```

---

## 6. Jaeger and Zipkin UI Access

### Jaeger (Recommended)

```bash
# Run Jaeger all-in-one for local development
docker run -d --name jaeger \
  -p 6831:6831/udp \
  -p 6832:6832/udp \
  -p 16686:16686 \
  -p 14268:14268 \
  -p 4317:4317 \
  -p 4318:4318 \
  jaegertracing/all-in-one:latest
```

Access the Jaeger UI at `http://localhost:16686`. Search by service name, trace ID, or operation
name. Use the comparison view to diff two traces for latency regression analysis.

### Zipkin (Alternative)

```bash
docker run -d --name zipkin -p 9411:9411 openzipkin/zipkin:latest
```

Access the Zipkin UI at `http://localhost:9411`. Useful if the team already has Zipkin infrastructure.
OpenTelemetry supports both exporters simultaneously.

---

## 7. Span Attributes Best Practices

Follow OpenTelemetry Semantic Conventions for attribute naming:

| Attribute | Example | Purpose |
|-----------|---------|---------|
| `http.method` | `GET` | Auto-set by HTTP instrumentation |
| `http.url` | `/api/matches` | Auto-set by HTTP instrumentation |
| `db.system` | `cosmosdb` | Auto-set by DB instrumentation |
| `candidate.id` | `cand-12345` | Custom: business entity ID |
| `job.id` | `job-67890` | Custom: business entity ID |
| `matching.score` | `0.85` | Custom: business metric |
| `error.type` | `ValidationException` | Custom: error classification |
| `tenant.id` | `tenant-abc` | Custom: multi-tenancy context |

Never put PII (names, emails, national IDs) in span attributes. Use opaque identifiers only.
This is critical for GDPR/CNIL compliance.

---

## 8. Kubernetes Deployment Configuration

```yaml
# Helm values for OpenTelemetry sidecar / environment injection
env:
  - name: OTEL_SERVICE_NAME
    value: "matching-engine"
  - name: OTEL_EXPORTER_OTLP_ENDPOINT
    value: "http://otel-collector.observability.svc.cluster.local:4317"
  - name: OTEL_SAMPLING_RATIO
    value: "0.1"
  - name: JAEGER_AGENT_HOST
    valueFrom:
      fieldRef:
        fieldPath: status.hostIP
  - name: JAEGER_AGENT_PORT
    value: "6831"
```

---

## 9. Troubleshooting Checklist

- **No traces appearing**: Verify the exporter endpoint is reachable from the pod/container. Check
  that the collector or Jaeger agent is running and accepting connections on the configured port.
- **Missing child spans**: Ensure the async context is propagated. In .NET use `Activity.Current`;
  in Node.js ensure `startActiveSpan` is used; in Python use `start_as_current_span`.
- **Broken trace continuity**: Confirm all services use the same propagation format (W3C). Mixed
  B3 and W3C propagators will split traces.
- **High memory usage**: Reduce sampling ratio or switch to tail-based sampling at the collector.
  BatchSpanProcessor queues can grow under high throughput.
- **Sensitive data in traces**: Audit span attributes and ensure no PII is recorded. Use the
  OpenTelemetry Collector `attributes` processor to redact fields before export.
