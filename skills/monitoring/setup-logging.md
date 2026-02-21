---
name: setup-logging
description: Configure structured logging with correlation IDs, log levels, and log aggregation
argument-hint: [library: serilog|winston|loguru|log4j]
---

# Structured Logging Setup

## .NET (Serilog)
```csharp
// Program.cs
builder.Host.UseSerilog((context, configuration) =>
{
    configuration
        .ReadFrom.Configuration(context.Configuration)
        .Enrich.FromLogContext()
        .Enrich.WithMachineName()
        .Enrich.WithEnvironmentName()
        .WriteTo.Console(outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj} {Properties:j}{NewLine}{Exception}")
        .WriteTo.File("logs/app-.txt", rollingInterval: RollingInterval.Day)
        .WriteTo.ApplicationInsights(TelemetryConfiguration.CreateDefault(), TelemetryConverter.Traces);
});

// Usage
_logger.LogInformation("User {UserId} created order {OrderId}", userId, orderId);
_logger.LogWarning("Low stock for product {ProductId}: {Quantity} remaining", productId, quantity);
_logger.LogError(exception, "Failed to process payment for order {OrderId}", orderId);
```

## Node.js (Winston)
```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'user-service' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Usage
logger.info('User created', { userId, email });
logger.warn('Low stock', { productId, quantity });
logger.error('Payment failed', { orderId, error: err.message });
```

## Best Practices
- Use structured logging (JSON)
- Include correlation IDs
- Log at appropriate levels (Debug, Info, Warn, Error)
- Don't log PII or secrets
- Aggregate logs (ELK, Application Insights)
- Set up alerts for errors
