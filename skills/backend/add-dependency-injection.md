---
name: add-dependency-injection
description: Setup dependency injection container for IoC
argument-hint: [stack: dotnet|node|python]
tags: [backend, DI, IoC, dependency-injection, SOLID]
---

# Dependency Injection Guide

DI decouples components by injecting dependencies through constructors rather than creating them directly.

---

## .NET 8 Built-in DI

```csharp
// Program.cs - Register services
builder.Services.AddScoped<ICandidateService, CandidateService>();
builder.Services.AddScoped<ICandidateRepository, CandidateRepository>();
builder.Services.AddSingleton<IEmailService, EmailService>();
builder.Services.AddTransient<IReportGenerator, PdfReportGenerator>();

// Inject via constructor
public class CandidateService : ICandidateService
{
    private readonly ICandidateRepository _repository;
    private readonly ILogger<CandidateService> _logger;

    public CandidateService(ICandidateRepository repository, ILogger<CandidateService> logger)
    {
        _repository = repository;
        _logger = logger;
    }
}
```

### Lifetime Comparison

| Lifetime | Scope | Use For |
|----------|-------|---------|
| Singleton | One instance for app lifetime | Configuration, caches, HttpClientFactory |
| Scoped | One instance per HTTP request | DbContext, repositories, services with request state |
| Transient | New instance every injection | Lightweight, stateless services |

### Keyed Services (.NET 8)

```csharp
builder.Services.AddKeyedScoped<INotificationService, EmailNotification>("email");
builder.Services.AddKeyedScoped<INotificationService, SmsNotification>("sms");

public class OrderService([FromKeyedServices("email")] INotificationService notifier) { }
```

---

## Node.js (Awilix)

```javascript
const { createContainer, asClass, Lifetime } = require('awilix');

const container = createContainer();
container.register({
  candidateService: asClass(CandidateService).scoped(),
  candidateRepo: asClass(CandidateRepository).scoped(),
  emailService: asClass(EmailService).singleton(),
});

// Express middleware
app.use(scopePerRequest(container));

// Resolve in route
app.get('/candidates', (req, res) => {
  const service = req.container.resolve('candidateService');
  return res.json(await service.getAll());
});
```

---

## Python (dependency-injector)

```python
from dependency_injector import containers, providers

class Container(containers.DeclarativeContainer):
    config = providers.Configuration()
    db = providers.Singleton(Database, url=config.db_url)
    candidate_repo = providers.Factory(CandidateRepository, db=db)
    candidate_service = providers.Factory(CandidateService, repo=candidate_repo)

# FastAPI
container = Container()
container.config.db_url.from_env("DATABASE_URL")

@app.get("/candidates")
async def get_candidates(service: CandidateService = Depends(Provide[Container.candidate_service])):
    return await service.get_all()
```

---

## Common Pitfalls

| Issue | Problem | Solution |
|-------|---------|----------|
| Captive dependency | Singleton holds Scoped reference | Use `IServiceScopeFactory` |
| Service locator | Resolving from container directly | Always use constructor injection |
| Circular dependency | A needs B, B needs A | Introduce interface or mediator |
| Over-injection | Constructor has 8+ params | Facade or aggregate service |
