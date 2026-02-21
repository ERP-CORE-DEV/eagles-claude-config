---
name: add-service-discovery
description: Add service discovery with Consul, Azure Service Fabric, or Eureka for microservices
tags: [microservices, service-discovery, consul, azure, health-checks, load-balancing]
complexity: MODERATE
stacks: [dotnet, nodejs, azure]
related: [implement-api-gateway, add-distributed-tracing]
---

# Add Service Discovery

Implement service discovery to enable dynamic service registration, health monitoring, and load balancing across microservices. This skill covers Consul, Azure Service Fabric, and Eureka implementations for .NET 8 and Node.js services.

## Context: RH-OptimERP Architecture

**12 Microservices that need coordination:**
1. Sourcing & Candidate Attraction (this repo)
2. Training & Skill Development
3. Payroll & Compensation
4. Time & Attendance Management
5. Performance Management
6. Recruitment & Onboarding
7. Employee Self-Service Portal
8. HR Analytics & Reporting
9. Document Management
10. Compliance & Legal
11. Benefits Administration
12. Talent Management

**Service Discovery Requirements:**
- Dynamic instance registration/deregistration
- Health check monitoring (HTTP, TCP, custom)
- Load balancing across multiple instances
- Service metadata (version, environment, capabilities)
- Azure AKS integration with DNS-based discovery
- GDPR compliance (no PII in service metadata)

## Implementation Strategies

### Strategy 1: Azure Service Fabric (Recommended for Azure AKS)

**Why Azure Service Fabric for RH-OptimERP:**
- Native integration with Azure AKS
- DNS-based service discovery (`<service-name>.<namespace>.svc.cluster.local`)
- Built-in health probes (liveness, readiness, startup)
- No additional infrastructure required
- Free (included with AKS)

**Kubernetes Service Discovery Setup:**

```yaml
# deployment-candidate-matching.yaml
apiVersion: v1
kind: Service
metadata:
  name: matching-engine-service
  namespace: sourcing-candidate
  labels:
    app: matching-engine
    version: v1.2.0
    microservice: sourcing-candidate-attraction
spec:
  selector:
    app: matching-engine
  ports:
    - name: http
      protocol: TCP
      port: 80
      targetPort: 8080
    - name: health
      protocol: TCP
      port: 8081
      targetPort: 8081
  type: ClusterIP  # Internal service discovery
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: matching-engine
  namespace: sourcing-candidate
spec:
  replicas: 3
  selector:
    matchLabels:
      app: matching-engine
  template:
    metadata:
      labels:
        app: matching-engine
        version: v1.2.0
    spec:
      containers:
      - name: matching-engine
        image: acrsourcingcandidate.azurecr.io/matching-engine:v1.2.0
        ports:
        - containerPort: 8080
          name: http
        - containerPort: 8081
          name: health
        env:
        - name: ASPNETCORE_ENVIRONMENT
          value: "Production"
        - name: SERVICE_NAME
          value: "matching-engine-service"
        - name: TRAINING_SERVICE_URL
          value: "http://training-service.training-skill-dev.svc.cluster.local"
        livenessProbe:
          httpGet:
            path: /health/live
            port: 8081
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 8081
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
        startupProbe:
          httpGet:
            path: /health/startup
            port: 8081
          initialDelaySeconds: 0
          periodSeconds: 10
          timeoutSeconds: 3
          failureThreshold: 30
        resources:
          requests:
            cpu: 100m
            memory: 256Mi
          limits:
            cpu: 500m
            memory: 512Mi
```

**.NET 8 Health Check Implementation:**

```csharp
// Program.cs - Matching Engine Backend
using Microsoft.Extensions.Diagnostics.HealthChecks;

var builder = WebApplication.CreateBuilder(args);

// Add health checks
builder.Services.AddHealthChecks()
    .AddCheck("self", () => HealthCheckResult.Healthy("Service is running"))
    .AddCheck("cosmosdb", async () =>
    {
        try
        {
            var cosmosClient = builder.Services.BuildServiceProvider()
                .GetRequiredService<CosmosClient>();
            await cosmosClient.ReadAccountAsync();
            return HealthCheckResult.Healthy("CosmosDB connection successful");
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Unhealthy("CosmosDB connection failed", ex);
        }
    }, tags: new[] { "ready" })
    .AddCheck("training-service", async () =>
    {
        var httpClient = new HttpClient();
        var trainingServiceUrl = builder.Configuration["TrainingServiceUrl"];
        try
        {
            var response = await httpClient.GetAsync($"{trainingServiceUrl}/health/ready");
            return response.IsSuccessStatusCode
                ? HealthCheckResult.Healthy("Training service reachable")
                : HealthCheckResult.Degraded($"Training service returned {response.StatusCode}");
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Degraded("Training service unreachable", ex);
        }
    }, tags: new[] { "ready" });

var app = builder.Build();

// Health check endpoints
app.MapHealthChecks("/health/live", new HealthCheckOptions
{
    Predicate = _ => false // Only self check
});

app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready"),
    ResponseWriter = async (context, report) =>
    {
        context.Response.ContentType = "application/json";
        var result = new
        {
            status = report.Status.ToString(),
            checks = report.Entries.Select(e => new
            {
                name = e.Key,
                status = e.Value.Status.ToString(),
                description = e.Value.Description,
                duration = e.Value.Duration.TotalMilliseconds
            }),
            totalDuration = report.TotalDuration.TotalMilliseconds
        };
        await context.Response.WriteAsJsonAsync(result);
    }
});

app.MapHealthChecks("/health/startup", new HealthCheckOptions
{
    Predicate = _ => false
});

app.Run();
```

**Node.js Health Check Implementation (Frontend):**

```javascript
// server.js - React Frontend Server (Express)
const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// Health check state
let isReady = false;
let lastBackendCheck = null;

// Startup initialization
async function initializeService() {
  try {
    const backendUrl = process.env.REACT_APP_API_BASE_URL;
    const response = await axios.get(`${backendUrl}/health/ready`, { timeout: 5000 });
    lastBackendCheck = { status: 'healthy', timestamp: Date.now() };
    isReady = true;
    console.log('Service initialized successfully');
  } catch (error) {
    console.error('Backend health check failed during startup:', error.message);
    isReady = false;
  }
}

// Liveness probe - always returns 200 if process is running
app.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'UP' });
});

// Readiness probe - checks backend dependency
app.get('/health/ready', async (req, res) => {
  if (!isReady) {
    return res.status(503).json({
      status: 'NOT_READY',
      reason: 'Service not initialized'
    });
  }

  // Check backend every 30 seconds
  if (!lastBackendCheck || Date.now() - lastBackendCheck.timestamp > 30000) {
    try {
      const backendUrl = process.env.REACT_APP_API_BASE_URL;
      await axios.get(`${backendUrl}/health/ready`, { timeout: 3000 });
      lastBackendCheck = { status: 'healthy', timestamp: Date.now() };
    } catch (error) {
      lastBackendCheck = { status: 'unhealthy', timestamp: Date.now() };
      return res.status(503).json({
        status: 'DEGRADED',
        reason: 'Backend unreachable',
        details: error.message
      });
    }
  }

  res.status(200).json({
    status: 'READY',
    backend: lastBackendCheck.status,
    lastChecked: new Date(lastBackendCheck.timestamp).toISOString()
  });
});

// Startup probe - ensures dependencies are loaded
app.get('/health/startup', (req, res) => {
  if (isReady) {
    res.status(200).json({ status: 'STARTED' });
  } else {
    res.status(503).json({ status: 'STARTING' });
  }
});

// Initialize and start server
initializeService().then(() => {
  app.listen(PORT, () => {
    console.log(`Frontend server running on port ${PORT}`);
  });
});
```

### Strategy 2: Consul (For Multi-Cloud or Hybrid Deployments)

**When to use Consul:**
- Multi-cloud deployments (Azure + AWS + on-premise)
- Need advanced service mesh features (Consul Connect)
- Cross-datacenter service discovery
- Key-value store for configuration

**Consul Setup (Docker Compose for local dev):**

```yaml
# docker-compose.consul.yml
version: '3.8'
services:
  consul:
    image: consul:1.17
    container_name: consul-server
    ports:
      - "8500:8500"  # HTTP API
      - "8600:8600/udp"  # DNS interface
    command: agent -server -ui -bootstrap-expect=1 -client=0.0.0.0
    environment:
      - CONSUL_BIND_INTERFACE=eth0
    volumes:
      - consul-data:/consul/data
    networks:
      - rh-optimerp

  matching-engine:
    image: acrsourcingcandidate.azurecr.io/matching-engine:latest
    depends_on:
      - consul
    environment:
      - CONSUL_HTTP_ADDR=http://consul:8500
      - SERVICE_NAME=matching-engine
      - SERVICE_PORT=8080
    networks:
      - rh-optimerp

volumes:
  consul-data:

networks:
  rh-optimerp:
    driver: bridge
```

**.NET 8 Consul Integration (Nuget: Consul 1.7.2.3):**

```csharp
// Services/ConsulServiceRegistry.cs
using Consul;
using Microsoft.Extensions.Options;

public class ConsulServiceRegistry : IHostedService
{
    private readonly IConsulClient _consulClient;
    private readonly IConfiguration _configuration;
    private string _serviceId;

    public ConsulServiceRegistry(IConsulClient consulClient, IConfiguration configuration)
    {
        _consulClient = consulClient;
        _configuration = configuration;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        var serviceName = _configuration["ServiceName"] ?? "matching-engine";
        var servicePort = int.Parse(_configuration["ServicePort"] ?? "8080");
        var serviceAddress = _configuration["ServiceAddress"] ?? "localhost";
        _serviceId = $"{serviceName}-{Guid.NewGuid()}";

        var registration = new AgentServiceRegistration
        {
            ID = _serviceId,
            Name = serviceName,
            Address = serviceAddress,
            Port = servicePort,
            Tags = new[]
            {
                "microservice:sourcing-candidate-attraction",
                "version:v1.2.0",
                "environment:production"
            },
            Meta = new Dictionary<string, string>
            {
                { "project", "rh-optimerp" },
                { "compliance", "gdpr-cnil" }
            },
            Check = new AgentServiceCheck
            {
                HTTP = $"http://{serviceAddress}:{servicePort}/health/ready",
                Interval = TimeSpan.FromSeconds(10),
                Timeout = TimeSpan.FromSeconds(5),
                DeregisterCriticalServiceAfter = TimeSpan.FromMinutes(1)
            }
        };

        await _consulClient.Agent.ServiceRegister(registration, cancellationToken);
        Console.WriteLine($"Service registered with Consul: {_serviceId}");
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        await _consulClient.Agent.ServiceDeregister(_serviceId, cancellationToken);
        Console.WriteLine($"Service deregistered from Consul: {_serviceId}");
    }
}

// Program.cs registration
builder.Services.AddSingleton<IConsulClient>(p =>
{
    var consulConfig = new ConsulClientConfiguration
    {
        Address = new Uri(builder.Configuration["Consul:Address"] ?? "http://localhost:8500")
    };
    return new ConsulClient(consulConfig);
});
builder.Services.AddHostedService<ConsulServiceRegistry>();
```

**Service Discovery Client:**

```csharp
// Services/ServiceDiscoveryClient.cs
using Consul;

public interface IServiceDiscoveryClient
{
    Task<string> GetServiceUrlAsync(string serviceName);
}

public class ConsulServiceDiscoveryClient : IServiceDiscoveryClient
{
    private readonly IConsulClient _consulClient;
    private readonly ILogger<ConsulServiceDiscoveryClient> _logger;

    public ConsulServiceDiscoveryClient(IConsulClient consulClient, ILogger<ConsulServiceDiscoveryClient> logger)
    {
        _consulClient = consulClient;
        _logger = logger;
    }

    public async Task<string> GetServiceUrlAsync(string serviceName)
    {
        var services = await _consulClient.Health.Service(serviceName, null, true);
        if (!services.Response.Any())
        {
            _logger.LogError($"No healthy instances found for service: {serviceName}");
            throw new InvalidOperationException($"Service not found: {serviceName}");
        }

        // Simple round-robin (use Polly for advanced load balancing)
        var service = services.Response[Random.Shared.Next(services.Response.Length)];
        var url = $"http://{service.Service.Address}:{service.Service.Port}";

        _logger.LogInformation($"Resolved {serviceName} to {url}");
        return url;
    }
}
```

## Testing Strategies

### Unit Tests (Health Checks)

```csharp
// Tests/HealthCheckTests.cs
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Xunit;

public class HealthCheckTests
{
    [Fact]
    public async Task HealthCheck_Self_ReturnsHealthy()
    {
        var healthCheck = new SelfHealthCheck();
        var result = await healthCheck.CheckHealthAsync(new HealthCheckContext());

        Assert.Equal(HealthStatus.Healthy, result.Status);
        Assert.Equal("Service is running", result.Description);
    }

    [Fact]
    public async Task HealthCheck_CosmosDB_WhenConnectionFails_ReturnsUnhealthy()
    {
        var mockCosmosClient = new Mock<CosmosClient>();
        mockCosmosClient.Setup(c => c.ReadAccountAsync())
            .ThrowsAsync(new CosmosException("Connection failed", System.Net.HttpStatusCode.ServiceUnavailable, 0, "", 0));

        var healthCheck = new CosmosHealthCheck(mockCosmosClient.Object);
        var result = await healthCheck.CheckHealthAsync(new HealthCheckContext());

        Assert.Equal(HealthStatus.Unhealthy, result.Status);
    }
}
```

### Integration Tests (Service Discovery)

```csharp
// Tests/ServiceDiscoveryIntegrationTests.cs
using Xunit;

public class ServiceDiscoveryIntegrationTests : IClassFixture<ConsulFixture>
{
    private readonly ConsulFixture _consulFixture;

    public ServiceDiscoveryIntegrationTests(ConsulFixture consulFixture)
    {
        _consulFixture = consulFixture;
    }

    [Fact]
    public async Task GetServiceUrl_WhenServiceRegistered_ReturnsUrl()
    {
        var client = new ConsulServiceDiscoveryClient(_consulFixture.ConsulClient, Mock.Of<ILogger<ConsulServiceDiscoveryClient>>());

        var url = await client.GetServiceUrlAsync("training-service");

        Assert.NotNull(url);
        Assert.StartsWith("http://", url);
    }
}

public class ConsulFixture : IDisposable
{
    public IConsulClient ConsulClient { get; }

    public ConsulFixture()
    {
        ConsulClient = new ConsulClient(config => config.Address = new Uri("http://localhost:8500"));
    }

    public void Dispose() { }
}
```

## French HR Compliance

**GDPR Requirements for Service Discovery:**
- ❌ No PII in service metadata (employee names, IDs, emails)
- ✅ Only technical metadata (version, environment, capabilities)
- ✅ Service logs must not contain candidate/employee data
- ✅ Health check responses must be anonymized

**Example Compliant Metadata:**

```csharp
Meta = new Dictionary<string, string>
{
    { "project", "rh-optimerp" },
    { "microservice", "sourcing-candidate-attraction" },
    { "compliance", "gdpr-cnil" },
    { "data-classification", "restricted" },  // Not PII itself
    { "version", "v1.2.0" },
    { "environment", "production" }
    // ❌ NEVER: { "current-users", "123" } - violates GDPR
    // ❌ NEVER: { "last-candidate", "Jean Dupont" } - violates GDPR
}
```

## Performance Considerations

**Health Check Best Practices:**
- Liveness: <50ms (minimal checks, just process health)
- Readiness: <500ms (includes dependency checks)
- Startup: <10s (one-time initialization checks)
- Cache dependency checks (30s TTL) to avoid overloading downstream services

**Load Balancing:**
- Kubernetes: Round-robin by default (use Istio for advanced)
- Consul: Client-side load balancing with health filtering
- Target: <10ms service discovery overhead

## Related Skills
- `implement-api-gateway` - Route requests to discovered services
- `add-distributed-tracing` - Trace requests across discovered services
- `implement-circuit-breaker` - Handle failures in discovered services

## References
- [Azure AKS Service Discovery](https://learn.microsoft.com/en-us/azure/aks/concepts-network)
- [Consul Service Discovery](https://developer.hashicorp.com/consul/docs/discovery)
- [.NET Health Checks](https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/health-checks)
