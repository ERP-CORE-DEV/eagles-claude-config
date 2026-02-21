---
name: introduce-design-pattern
description: Introduce a design pattern to solve a recurring structural or behavioral problem
argument-hint: [pattern: strategy|factory|observer|decorator|adapter|singleton|builder]
tags: [refactoring, design-patterns, GoF, architecture, clean-code]
---

# Introduce Design Pattern Guide

Patterns solve **recurring** problems. Only introduce when the problem is clear — premature patterns add complexity without value.

---

## Decision Framework

```
Problem identified → 3+ occurrences? → No → Don't abstract yet
                                      → Yes → Which type?
  ├─ Different behaviors, same interface → Strategy
  ├─ Complex object creation → Factory / Builder
  ├─ React to state changes → Observer
  ├─ Add responsibilities dynamically → Decorator
  ├─ Incompatible interfaces → Adapter
  └─ Control access → Proxy
```

---

## 1. Strategy Pattern

Replace conditional logic with interchangeable algorithms.

### .NET 8

```csharp
public interface IScoringStrategy
{
    string Name { get; }
    decimal Weight { get; }
    decimal Score(Candidate candidate, JobOffer job);
}

public class SkillMatchStrategy : IScoringStrategy
{
    public string Name => "Skills";
    public decimal Weight => 0.4m;
    public decimal Score(Candidate c, JobOffer j)
    {
        var matched = c.Skills.Intersect(j.RequiredSkills).Count();
        return j.RequiredSkills.Count == 0 ? 1m : (decimal)matched / j.RequiredSkills.Count;
    }
}

public class ExperienceStrategy : IScoringStrategy
{
    public string Name => "Experience";
    public decimal Weight => 0.3m;
    public decimal Score(Candidate c, JobOffer j)
        => Math.Min(1m, (decimal)c.YearsOfExperience / Math.Max(1, j.MinYearsExperience));
}

// Usage with DI
builder.Services.AddSingleton<IScoringStrategy, SkillMatchStrategy>();
builder.Services.AddSingleton<IScoringStrategy, ExperienceStrategy>();

public class MatchingService(IEnumerable<IScoringStrategy> strategies)
{
    public decimal CalculateScore(Candidate c, JobOffer j)
        => strategies.Sum(s => s.Score(c, j) * s.Weight);
}
```

### TypeScript

```typescript
interface ScoringStrategy {
  name: string;
  weight: number;
  score(candidate: Candidate, job: JobOffer): number;
}

const skillMatch: ScoringStrategy = {
  name: 'Skills',
  weight: 0.4,
  score: (c, j) => {
    const matched = c.skills.filter(s => j.requiredSkills.includes(s)).length;
    return j.requiredSkills.length === 0 ? 1 : matched / j.requiredSkills.length;
  },
};

function calculateScore(c: Candidate, j: JobOffer, strategies: ScoringStrategy[]): number {
  return strategies.reduce((sum, s) => sum + s.score(c, j) * s.weight, 0);
}
```

### Python

```python
from abc import ABC, abstractmethod

class ScoringStrategy(ABC):
    name: str
    weight: float

    @abstractmethod
    def score(self, candidate: Candidate, job: JobOffer) -> float: ...

class SkillMatchStrategy(ScoringStrategy):
    name = "Skills"
    weight = 0.4

    def score(self, c: Candidate, j: JobOffer) -> float:
        matched = len(set(c.skills) & set(j.required_skills))
        return matched / max(1, len(j.required_skills))
```

---

## 2. Factory Pattern

Encapsulate object creation logic.

### .NET 8

```csharp
public interface INotificationSender
{
    Task SendAsync(string recipient, string message);
}

public class NotificationFactory(IServiceProvider sp)
{
    public INotificationSender Create(NotificationType type) => type switch
    {
        NotificationType.Email => sp.GetRequiredService<EmailSender>(),
        NotificationType.Sms => sp.GetRequiredService<SmsSender>(),
        NotificationType.Push => sp.GetRequiredService<PushSender>(),
        _ => throw new ArgumentOutOfRangeException(nameof(type))
    };
}
```

### TypeScript

```typescript
type NotificationType = 'email' | 'sms' | 'push';

function createNotificationSender(type: NotificationType): NotificationSender {
  const senders: Record<NotificationType, () => NotificationSender> = {
    email: () => new EmailSender(),
    sms: () => new SmsSender(),
    push: () => new PushSender(),
  };
  return senders[type]();
}
```

---

## 3. Observer Pattern

Decouple event producers from consumers.

### .NET 8 (Domain Events)

```csharp
public interface IDomainEvent { DateTime OccurredAt { get; } }
public record CandidateMatchedEvent(string CandidateId, string JobId, decimal Score) : IDomainEvent
{
    public DateTime OccurredAt { get; } = DateTime.UtcNow;
}

public interface IDomainEventHandler<in T> where T : IDomainEvent
{
    Task HandleAsync(T domainEvent, CancellationToken ct = default);
}

public class SendMatchNotificationHandler : IDomainEventHandler<CandidateMatchedEvent>
{
    public async Task HandleAsync(CandidateMatchedEvent e, CancellationToken ct)
    {
        // Send email/push notification to recruiter
    }
}

// Registration
builder.Services.AddScoped<IDomainEventHandler<CandidateMatchedEvent>, SendMatchNotificationHandler>();
```

### TypeScript (EventEmitter)

```typescript
type EventMap = {
  'candidate:matched': { candidateId: string; jobId: string; score: number };
  'candidate:rejected': { candidateId: string; reason: string };
};

class TypedEventEmitter<T extends Record<string, unknown>> {
  private handlers = new Map<keyof T, Set<(data: any) => void>>();

  on<K extends keyof T>(event: K, handler: (data: T[K]) => void) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  emit<K extends keyof T>(event: K, data: T[K]) {
    this.handlers.get(event)?.forEach(h => h(data));
  }
}
```

---

## 4. Decorator Pattern

Add behavior without modifying the original class.

### .NET 8 (Scrutor)

```csharp
// Base service
public class CandidateService : ICandidateService
{
    public async Task<Candidate> GetByIdAsync(string id) => /* ... */;
}

// Caching decorator
public class CachedCandidateService(ICandidateService inner, IMemoryCache cache) : ICandidateService
{
    public async Task<Candidate> GetByIdAsync(string id)
        => await cache.GetOrCreateAsync($"candidate:{id}",
            async entry => { entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5); return await inner.GetByIdAsync(id); });
}

// Logging decorator
public class LoggingCandidateService(ICandidateService inner, ILogger<LoggingCandidateService> log) : ICandidateService
{
    public async Task<Candidate> GetByIdAsync(string id)
    {
        log.LogInformation("Getting candidate {Id}", id);
        var result = await inner.GetByIdAsync(id);
        log.LogInformation("Found candidate {Id}: {Found}", id, result is not null);
        return result;
    }
}

// Register decoration chain (Scrutor)
builder.Services.AddScoped<ICandidateService, CandidateService>();
builder.Services.Decorate<ICandidateService, CachedCandidateService>();
builder.Services.Decorate<ICandidateService, LoggingCandidateService>();
```

---

## When NOT to Use Patterns

| Scenario | Why |
|----------|-----|
| Only 1-2 variants | YAGNI — extract when 3rd appears |
| Simple CRUD operations | Patterns add overhead without benefit |
| Test code | Keep tests simple and explicit |
| Different bounded contexts | Coupling across services is worse |
| Team unfamiliar with pattern | Patterns should clarify, not confuse |

---

## Refactoring Steps

1. **Identify** the recurring problem (3+ occurrences)
2. **Choose** the simplest pattern that solves it
3. **Extract** interface first (compile, verify tests pass)
4. **Implement** one concrete class (verify tests)
5. **Migrate** remaining occurrences one at a time
6. **Remove** old code only after all tests pass
