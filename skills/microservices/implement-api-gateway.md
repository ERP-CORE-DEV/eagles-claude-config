---
name: implement-api-gateway
description: Implement API Gateway pattern with Azure API Management, YARP, or Ocelot
tags: [microservices, api-gateway, azure-apim, yarp, rate-limiting, authentication]
complexity: COMPLEX
stacks: [dotnet, azure, kubernetes]
related: [add-service-discovery, implement-rate-limiting, add-jwt-authentication]
---

# Implement API Gateway

Implement an API Gateway to provide a unified entry point for RH-OptimERP's 12 microservices. This skill covers Azure API Management (APIM), YARP (Yet Another Reverse Proxy), and Ocelot for .NET 8 microservices.

## Context: RH-OptimERP Requirements

**12 Microservices Behind Gateway:**
1. Sourcing & Candidate Attraction - `/api/sourcing/*`
2. Training & Skill Development - `/api/training/*`
3. Payroll & Compensation - `/api/payroll/*`
4. Time & Attendance - `/api/attendance/*`
5. Performance Management - `/api/performance/*`
6. Recruitment & Onboarding - `/api/recruitment/*`
7. Employee Self-Service - `/api/ess/*`
8. HR Analytics - `/api/analytics/*`
9. Document Management - `/api/documents/*`
10. Compliance & Legal - `/api/compliance/*`
11. Benefits Administration - `/api/benefits/*`
12. Talent Management - `/api/talent/*`

**Gateway Requirements:**
- **Multi-tenant routing**: Route by entreprise subdomain (`acme.rh-optimerp.com`)
- **Authentication**: JWT validation (Azure AD B2C)
- **Rate limiting**: 100 req/min per user, 1000 req/min per entreprise
- **Request transformation**: Add correlation IDs, tenant context
- **Response caching**: Cache GET requests (5min TTL)
- **GDPR compliance**: PII encryption in transit, audit logs
- **French HR routing**: Special handling for CPF, OPCO, CNIL endpoints

## Implementation Strategies

### Strategy 1: Azure API Management (Recommended for Production)

**Why Azure APIM for RH-OptimERP:**
- Enterprise-grade features (OAuth2, rate limiting, caching)
- Native Azure integration (AKS, Key Vault, Application Insights)
- Developer portal for API documentation
- Per-tenant routing via policies
- Built-in DDoS protection

**Azure APIM Setup (Bicep/ARM Template):**

```bicep
// apim-deployment.bicep
resource apimService 'Microsoft.ApiManagement/service@2023-05-01-preview' = {
  name: 'apim-rh-optimerp'
  location: resourceGroup().location
  sku: {
    name: 'Developer'  // Use 'Premium' for multi-region
    capacity: 1
  }
  properties: {
    publisherEmail: 'admin@rh-optimerp.com'
    publisherName: 'RH-OptimERP'
    customProperties: {
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Protocols.Tls10': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Protocols.Tls11': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Backend.Protocols.Tls10': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Backend.Protocols.Tls11': 'False'
    }
  }
}

// Named Values (Configuration)
resource namedValueCosmosConnectionString 'Microsoft.ApiManagement/service/namedValues@2023-05-01-preview' = {
  parent: apimService
  name: 'cosmos-connection-string'
  properties: {
    displayName: 'CosmosDB Connection String'
    secret: true
    keyVault: {
      secretIdentifier: 'https://kv-rh-optimerp.vault.azure.net/secrets/cosmos-connection-string'
    }
  }
}

// Backend (AKS Internal Service)
resource backendMatchingEngine 'Microsoft.ApiManagement/service/backends@2023-05-01-preview' = {
  parent: apimService
  name: 'matching-engine-backend'
  properties: {
    url: 'http://matching-engine-service.sourcing-candidate.svc.cluster.local'
    protocol: 'http'
    description: 'Candidate Matching Engine Microservice'
    properties: {
      serviceFabricCluster: null
    }
  }
}

// API Definition
resource apiSourcing 'Microsoft.ApiManagement/service/apis@2023-05-01-preview' = {
  parent: apimService
  name: 'sourcing-api'
  properties: {
    displayName: 'Sourcing & Candidate Attraction API'
    description: 'API for candidate matching, sourcing, and attraction'
    path: 'api/sourcing'
    protocols: ['https']
    subscriptionRequired: true
    apiVersion: 'v1'
    apiVersionSetId: apiVersionSet.id
  }
}

resource apiVersionSet 'Microsoft.ApiManagement/service/apiVersionSets@2023-05-01-preview' = {
  parent: apimService
  name: 'sourcing-api-version-set'
  properties: {
    displayName: 'Sourcing API'
    versioningScheme: 'Segment'
  }
}
```

**APIM Policy (XML) for Multi-Tenant Routing:**

```xml
<!-- policies.xml -->
<policies>
    <inbound>
        <!-- Extract tenant from subdomain (acme.rh-optimerp.com -> acme) -->
        <set-variable name="tenantId" value="@{
            var host = context.Request.OriginalUrl.Host;
            var parts = host.Split('.');
            return parts.Length > 2 ? parts[0] : "default";
        }" />

        <!-- Validate JWT token (Azure AD B2C) -->
        <validate-jwt header-name="Authorization" failed-validation-httpcode="401" failed-validation-error-message="Unauthorized">
            <openid-config url="https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration" />
            <audiences>
                <audience>api://rh-optimerp</audience>
            </audiences>
            <issuers>
                <issuer>https://sts.windows.net/{tenant-id}/</issuer>
            </issuers>
            <required-claims>
                <claim name="roles" match="any">
                    <value>HR.Admin</value>
                    <value>HR.Manager</value>
                    <value>HR.Employee</value>
                </claim>
            </required-claims>
        </validate-jwt>

        <!-- Rate limiting per user (100 req/min) -->
        <rate-limit-by-key calls="100" renewal-period="60" counter-key="@(context.Request.Headers.GetValueOrDefault("Authorization","").AsJwt()?.Subject)" />

        <!-- Rate limiting per tenant (1000 req/min) -->
        <rate-limit-by-key calls="1000" renewal-period="60" counter-key="@((string)context.Variables["tenantId"])" />

        <!-- Add correlation ID -->
        <set-header name="X-Correlation-Id" exists-action="skip">
            <value>@(Guid.NewGuid().ToString())</value>
        </set-header>

        <!-- Add tenant context header -->
        <set-header name="X-Tenant-Id" exists-action="override">
            <value>@((string)context.Variables["tenantId"])</value>
        </set-header>

        <!-- GDPR audit logging (no PII) -->
        <log-to-eventhub logger-id="gdpr-audit-logger">
            @{
                return new JObject(
                    new JProperty("timestamp", DateTime.UtcNow),
                    new JProperty("correlationId", context.RequestId),
                    new JProperty("tenantId", context.Variables["tenantId"]),
                    new JProperty("api", context.Api.Name),
                    new JProperty("operation", context.Operation.Name),
                    new JProperty("method", context.Request.Method),
                    new JProperty("path", context.Request.Url.Path),
                    new JProperty("userRole", context.Request.Headers.GetValueOrDefault("Authorization","").AsJwt()?.Claims.GetValueOrDefault("roles", "unknown"))
                ).ToString();
            }
        </log-to-eventhub>

        <!-- Cache GET requests (5min) -->
        <cache-lookup vary-by-developer="false" vary-by-developer-groups="false" downstream-caching-type="none">
            <vary-by-header>Accept</vary-by-header>
            <vary-by-query-parameter>page</vary-by-query-parameter>
            <vary-by-query-parameter>pageSize</vary-by-query-parameter>
        </cache-lookup>

        <!-- Set backend service based on API path -->
        <set-backend-service backend-id="matching-engine-backend" />
    </inbound>

    <backend>
        <!-- Retry policy for transient failures -->
        <retry condition="@(context.Response.StatusCode >= 500)" count="3" interval="2" delta="1" max-interval="10">
            <forward-request timeout="30" />
        </retry>
    </backend>

    <outbound>
        <!-- Cache response for GET requests -->
        <cache-store duration="300" />

        <!-- Remove internal headers -->
        <set-header name="X-Internal-Service" exists-action="delete" />
        <set-header name="X-Pod-Name" exists-action="delete" />

        <!-- Add CORS headers -->
        <cors allow-credentials="true">
            <allowed-origins>
                <origin>https://*.rh-optimerp.com</origin>
            </allowed-origins>
            <allowed-methods>
                <method>GET</method>
                <method>POST</method>
                <method>PUT</method>
                <method>DELETE</method>
                <method>PATCH</method>
            </allowed-methods>
            <allowed-headers>
                <header>*</header>
            </allowed-headers>
        </cors>

        <!-- Add security headers -->
        <set-header name="X-Content-Type-Options" exists-action="override">
            <value>nosniff</value>
        </set-header>
        <set-header name="X-Frame-Options" exists-action="override">
            <value>DENY</value>
        </set-header>
        <set-header name="Strict-Transport-Security" exists-action="override">
            <value>max-age=31536000; includeSubDomains</value>
        </set-header>
    </outbound>

    <on-error>
        <!-- Log errors without PII -->
        <log-to-eventhub logger-id="error-logger">
            @{
                return new JObject(
                    new JProperty("timestamp", DateTime.UtcNow),
                    new JProperty("correlationId", context.RequestId),
                    new JProperty("errorMessage", context.LastError.Message),
                    new JProperty("errorSource", context.LastError.Source),
                    new JProperty("statusCode", context.Response.StatusCode)
                ).ToString();
            }
        </log-to-eventhub>

        <!-- Return sanitized error response -->
        <return-response>
            <set-status code="500" reason="Internal Server Error" />
            <set-header name="Content-Type" exists-action="override">
                <value>application/json</value>
            </set-header>
            <set-body>@{
                return new JObject(
                    new JProperty("error", "Une erreur s'est produite. Veuillez réessayer plus tard."),
                    new JProperty("correlationId", context.RequestId)
                ).ToString();
            }</set-body>
        </return-response>
    </on-error>
</policies>
```

### Strategy 2: YARP (Yet Another Reverse Proxy) - For AKS Ingress

**When to use YARP:**
- Need custom routing logic in C#
- Want to avoid Azure APIM costs (~€400/month)
- Deploy as Kubernetes Ingress Controller
- Open-source with Microsoft backing

**YARP Gateway Project Setup:**

```bash
# Create YARP gateway project
dotnet new web -n RH.OptimERP.Gateway
cd RH.OptimERP.Gateway
dotnet add package Yarp.ReverseProxy --version 2.1.0
dotnet add package Microsoft.AspNetCore.Authentication.JwtBearer --version 8.0.0
```

**appsettings.json - YARP Configuration:**

```json
{
  "ReverseProxy": {
    "Routes": {
      "sourcing-route": {
        "ClusterId": "sourcing-cluster",
        "Match": {
          "Path": "/api/sourcing/{**catch-all}"
        },
        "Transforms": [
          { "PathPattern": "/{**catch-all}" },
          { "RequestHeader": "X-Tenant-Id", "Set": "{tenant}" }
        ],
        "RateLimiterPolicy": "user-rate-limit"
      },
      "training-route": {
        "ClusterId": "training-cluster",
        "Match": {
          "Path": "/api/training/{**catch-all}"
        },
        "Transforms": [
          { "PathPattern": "/{**catch-all}" }
        ]
      }
    },
    "Clusters": {
      "sourcing-cluster": {
        "Destinations": {
          "destination1": {
            "Address": "http://matching-engine-service.sourcing-candidate.svc.cluster.local"
          }
        },
        "HealthCheck": {
          "Active": {
            "Enabled": true,
            "Interval": "00:00:10",
            "Timeout": "00:00:05",
            "Policy": "ConsecutiveFailures",
            "Path": "/health/ready"
          }
        },
        "LoadBalancingPolicy": "RoundRobin"
      },
      "training-cluster": {
        "Destinations": {
          "destination1": {
            "Address": "http://training-service.training-skill-dev.svc.cluster.local"
          }
        }
      }
    }
  },
  "Authentication": {
    "Authority": "https://login.microsoftonline.com/{tenant-id}",
    "Audience": "api://rh-optimerp"
  }
}
```

**Program.cs - YARP with Rate Limiting and JWT:**

```csharp
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

// Add JWT Authentication
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = builder.Configuration["Authentication:Authority"];
        options.Audience = builder.Configuration["Authentication:Audience"];
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true
        };
    });

// Add Rate Limiting
builder.Services.AddRateLimiter(options =>
{
    // Per-user rate limit (100 req/min)
    options.AddPolicy("user-rate-limit", context =>
    {
        var userId = context.User?.FindFirst("sub")?.Value ?? "anonymous";
        return RateLimitPartition.GetFixedWindowLimiter(userId, _ =>
            new FixedWindowRateLimiterOptions
            {
                PermitLimit = 100,
                Window = TimeSpan.FromMinutes(1),
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                QueueLimit = 10
            });
    });

    // Global rate limit (5000 req/min)
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
        RateLimitPartition.GetFixedWindowLimiter("global", _ =>
            new FixedWindowRateLimiterOptions
            {
                PermitLimit = 5000,
                Window = TimeSpan.FromMinutes(1)
            }));

    options.OnRejected = async (context, token) =>
    {
        context.HttpContext.Response.StatusCode = 429;
        await context.HttpContext.Response.WriteAsJsonAsync(new
        {
            error = "Trop de requêtes. Veuillez réessayer dans quelques instants.",
            retryAfter = context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter)
                ? retryAfter.TotalSeconds
                : 60
        }, cancellationToken: token);
    };
});

// Add YARP Reverse Proxy
builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));

// Add Response Caching
builder.Services.AddResponseCaching();

var app = builder.Build();

// Middleware pipeline
app.UseResponseCaching();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

// Custom middleware for tenant extraction
app.Use(async (context, next) =>
{
    var host = context.Request.Host.Host;
    var tenantId = host.Split('.')[0]; // Extract subdomain
    context.Request.Headers["X-Tenant-Id"] = tenantId;

    // Add correlation ID
    if (!context.Request.Headers.ContainsKey("X-Correlation-Id"))
    {
        context.Request.Headers["X-Correlation-Id"] = Guid.NewGuid().ToString();
    }

    await next();
});

// YARP Proxy
app.MapReverseProxy();

app.Run();
```

**Kubernetes Deployment (YARP as Ingress):**

```yaml
# gateway-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
  namespace: default
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-gateway
  template:
    metadata:
      labels:
        app: api-gateway
    spec:
      containers:
      - name: gateway
        image: acrsourcingcandidate.azurecr.io/api-gateway:v1.0.0
        ports:
        - containerPort: 8080
        env:
        - name: ASPNETCORE_ENVIRONMENT
          value: Production
        resources:
          requests:
            cpu: 200m
            memory: 256Mi
          limits:
            cpu: 1000m
            memory: 512Mi
---
apiVersion: v1
kind: Service
metadata:
  name: api-gateway-service
  namespace: default
spec:
  selector:
    app: api-gateway
  ports:
  - port: 80
    targetPort: 8080
  type: LoadBalancer
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: rh-optimerp-ingress
  namespace: default
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - "*.rh-optimerp.com"
    secretName: rh-optimerp-tls
  rules:
  - host: "*.rh-optimerp.com"
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: api-gateway-service
            port:
              number: 80
```

## French HR Compliance Features

**CPF (Compte Personnel de Formation) Routing:**
Special handling for CPF-eligible training programs requires validation against external APIs.

```xml
<!-- APIM Policy for CPF Validation -->
<inbound>
    <choose>
        <when condition="@(context.Request.Url.Path.Contains("/api/training/cpf"))">
            <!-- Call CPF validation API (Caisse des Dépôts) -->
            <send-request mode="new" response-variable-name="cpfResponse" timeout="10">
                <set-url>https://api.moncompteformation.gouv.fr/v1/validate</set-url>
                <set-method>POST</set-method>
                <set-header name="Authorization" exists-action="override">
                    <value>@((string)context.Variables["cpfApiKey"])</value>
                </set-header>
                <set-body>@(context.Request.Body.As<string>())</set-body>
            </send-request>

            <choose>
                <when condition="@(((IResponse)context.Variables["cpfResponse"]).StatusCode != 200)">
                    <return-response>
                        <set-status code="400" reason="Bad Request" />
                        <set-body>Formation non éligible au CPF</set-body>
                    </return-response>
                </when>
            </choose>
        </when>
    </choose>
</inbound>
```

**CNIL Data Access Logging:**
All API requests must be logged for GDPR compliance (audit trail for 3 years).

```csharp
// Middleware: CnilAuditLogger.cs
public class CnilAuditLoggerMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<CnilAuditLoggerMiddleware> _logger;

    public async Task InvokeAsync(HttpContext context)
    {
        var auditLog = new
        {
            Timestamp = DateTime.UtcNow,
            CorrelationId = context.Request.Headers["X-Correlation-Id"].ToString(),
            TenantId = context.Request.Headers["X-Tenant-Id"].ToString(),
            UserId = context.User?.FindFirst("sub")?.Value,
            UserRole = context.User?.FindFirst("roles")?.Value,
            Method = context.Request.Method,
            Path = context.Request.Path,
            // NO PII: No query params, no request body
        };

        _logger.LogInformation("CNIL Audit: {@AuditLog}", auditLog);
        await _next(context);
    }
}
```

## Testing Strategies

**Integration Tests (YARP Gateway):**

```csharp
// Tests/GatewayIntegrationTests.cs
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

public class GatewayIntegrationTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public GatewayIntegrationTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Gateway_RoutesToSourcingService_ReturnsSuccess()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/sourcing/health");

        response.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Gateway_RateLimitExceeded_Returns429()
    {
        var client = _factory.CreateClient();

        // Send 101 requests (limit is 100/min)
        for (int i = 0; i < 101; i++)
        {
            var response = await client.GetAsync("/api/sourcing/candidates");
            if (i < 100)
                Assert.True(response.IsSuccessStatusCode);
            else
                Assert.Equal(System.Net.HttpStatusCode.TooManyRequests, response.StatusCode);
        }
    }

    [Fact]
    public async Task Gateway_UnauthorizedRequest_Returns401()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/sourcing/candidates");

        Assert.Equal(System.Net.HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
```

**Load Testing (k6):**

```javascript
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 },  // Ramp-up to 100 users
    { duration: '5m', target: 100 },  // Stay at 100 users
    { duration: '2m', target: 0 },    // Ramp-down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% of requests < 500ms
    http_req_failed: ['rate<0.01'],     // Error rate < 1%
  },
};

const BASE_URL = 'https://acme.rh-optimerp.com';
const JWT_TOKEN = __ENV.JWT_TOKEN;

export default function () {
  const headers = {
    'Authorization': `Bearer ${JWT_TOKEN}`,
    'Content-Type': 'application/json',
  };

  // Test candidate search
  let res = http.get(`${BASE_URL}/api/sourcing/candidates?page=1&pageSize=20`, { headers });
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);
}
```

Run: `k6 run --env JWT_TOKEN=<token> load-test.js`

## Performance Considerations

**Gateway Performance Targets:**
- Throughput: >10,000 req/s (YARP), >5,000 req/s (APIM)
- Latency: <10ms added overhead
- Availability: 99.9% uptime (APIM Premium: 99.95%)

**Optimization Tips:**
- Enable HTTP/2 and HTTP/3 (QUIC)
- Use connection pooling to backend services
- Compress responses (gzip, br)
- Implement circuit breaker for failing services

## Related Skills
- `add-service-discovery` - Discover backend services dynamically
- `implement-rate-limiting` - Advanced rate limiting strategies
- `add-jwt-authentication` - OAuth2/OIDC authentication

## References
- [Azure API Management Policies](https://learn.microsoft.com/en-us/azure/api-management/api-management-policies)
- [YARP Documentation](https://microsoft.github.io/reverse-proxy/)
- [ASP.NET Core Rate Limiting](https://learn.microsoft.com/en-us/aspnet/core/performance/rate-limit)
