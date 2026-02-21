---
name: implement-circuit-breaker
description: Implement circuit breaker pattern to handle service failures gracefully
argument-hint: [library: polly|resilience4j|hystrix]
---

# Circuit Breaker Pattern

## .NET with Polly
```csharp
// Service registration
builder.Services.AddHttpClient("ExternalService")
    .AddTransientHttpErrorPolicy(policy =>
        policy.CircuitBreakerAsync(
            handledEventsAllowedBeforeBreaking: 3,
            durationOfBreak: TimeSpan.FromSeconds(30),
            onBreak: (outcome, timespan) =>
            {
                _logger.LogWarning("Circuit breaker opened for {Duration}", timespan);
            },
            onReset: () =>
            {
                _logger.LogInformation("Circuit breaker reset");
            }
        )
    );

// Usage
public class OrderService
{
    private readonly IHttpClientFactory _httpClientFactory;

    public async Task<Order> CreateOrderAsync(OrderDto dto)
    {
        var client = _httpClientFactory.CreateClient("ExternalService");

        try
        {
            var response = await client.PostAsJsonAsync("/api/orders", dto);
            return await response.Content.ReadFromJsonAsync<Order>();
        }
        catch (BrokenCircuitException)
        {
            // Circuit is open - return fallback
            return GetCachedOrder() ?? throw new ServiceUnavailableException();
        }
    }
}
```

## States
- **Closed**: Normal operation, requests pass through
- **Open**: Failures exceeded threshold, requests fail fast
- **Half-Open**: After timeout, test request sent to check recovery

## Retry + Circuit Breaker
```csharp
var retryPolicy = Policy
    .Handle<HttpRequestException>()
    .WaitAndRetryAsync(3, retryAttempt => TimeSpan.FromSeconds(Math.Pow(2, retryAttempt)));

var circuitBreakerPolicy = Policy
    .Handle<HttpRequestException>()
    .CircuitBreakerAsync(5, TimeSpan.FromMinutes(1));

var policyWrap = Policy.WrapAsync(retryPolicy, circuitBreakerPolicy);

await policyWrap.ExecuteAsync(() => MakeApiCallAsync());
```


## French HR Context

In French HR systems (RH-OptimERP), circuit breakers protect critical workflows:

**High-priority circuits (fail-fast):**
- Paie (payroll) service - SMIC validation, DSN generation
- URSSAF declaration submission
- CPF training account queries

**Medium-priority circuits (graceful degradation):**
- Candidate matching engine - return cached results on failure
- Email notification service - queue for retry
- Analytics/reporting - display cached dashboard

### .NET 8 Implementation

```csharp
// Using Polly v8 with .NET 8
using Polly;
using Polly.CircuitBreaker;

var circuitBreakerPolicy = Policy
    .Handle<HttpRequestException>()
    .Or<TimeoutException>()
    .CircuitBreakerAsync(
        exceptionsAllowedBeforeBreaking: 3,
        durationOfBreak: TimeSpan.FromSeconds(30),
        onBreak: (ex, breakDelay) =>
        {
            // Log circuit break for CNIL audit trail
            _logger.LogWarning("Circuit OUVERT pour {Service}: {Error}. Duree: {Delay}s",
                serviceName, ex.Message, breakDelay.TotalSeconds);
        },
        onReset: () =>
        {
            _logger.LogInformation("Circuit FERME pour {Service} - Service retabli", serviceName);
        },
        onHalfOpen: () =>
        {
            _logger.LogInformation("Circuit SEMI-OUVERT pour {Service} - Test en cours", serviceName);
        }
    );

// Usage in service
public async Task<PayrollResult> CalculatePayrollAsync(string employeeId)
{
    return await circuitBreakerPolicy.ExecuteAsync(async () =>
    {
        return await _payrollService.CalculateAsync(employeeId);
    });
}
```

### Node.js/TypeScript

```typescript
import CircuitBreaker from 'opossum';

const breakerOptions = {
  timeout: 5000,          // 5 seconds
  errorThresholdPercentage: 50,
  resetTimeout: 30000     // 30 seconds
};

const breaker = new CircuitBreaker(callExternalService, breakerOptions);

breaker.on('open', () => console.log('Circuit OUVERT'));
breaker.on('close', () => console.log('Circuit FERME'));
breaker.on('halfOpen', () => console.log('Circuit SEMI-OUVERT'));

// Fallback for degraded mode
breaker.fallback(() => ({ status: 'degraded', message: 'Service temporairement indisponible' }));
```

## Testing

```csharp
[Fact]
public async Task CircuitBreaker_OpensAfterThreeFailures()
{
    var callCount = 0;
    var policy = Policy.Handle<Exception>()
        .CircuitBreakerAsync(3, TimeSpan.FromSeconds(30));

    // Make 3 failing calls
    for (int i = 0; i < 3; i++)
    {
        try { await policy.ExecuteAsync(() => throw new Exception("Service down")); }
        catch { callCount++; }
    }

    // 4th call should throw BrokenCircuitException
    await Assert.ThrowsAsync<BrokenCircuitException>(
        () => policy.ExecuteAsync(() => Task.FromResult("ok")));
}
```

## Related Skills

- `/implement-saga-pattern` - Distributed transaction management
- `/add-service-discovery` - Service registration and health checks
- `/implement-api-gateway` - API gateway with retry policies
