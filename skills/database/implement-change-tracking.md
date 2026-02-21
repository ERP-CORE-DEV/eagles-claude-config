---
name: implement-change-tracking
description: Implement change data capture (CDC) for full audit trail with before/after values using CosmosDB Change Feed
argument-hint: "[tracking-level] [retention-days]"
tags: [database, change-tracking, cdc, audit-trail, cosmos-db, gdpr]
---

# Implement Change Tracking

Implements Change Data Capture (CDC) to track all changes to entities with before/after values, using CosmosDB Change Feed for real-time change propagation.

## When to Use

**Use change tracking when:**
- GDPR Article 30: Full processing activities log required
- CNIL audit: Must show who changed what, when, and what the previous value was
- French HR: Salary changes, contract modifications, disciplinary records
- Compliance: Financial data changes (payroll, social contributions)
- Real-time sync: Push changes to other microservices or reporting systems

**Avoid when:**
- High-volume, low-value data (logs, metrics)
- Read-only data that never changes
- Performance-critical hot paths (CDC adds overhead)

## Implementation

### .NET 8 (CosmosDB Change Feed)

**1. Change Log Entity:**
```csharp
// Domain/Models/ChangeLog.cs
public class ChangeLog
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string EntityType { get; set; } = string.Empty;
    public string EntityId { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty; // Create, Update, Delete
    public string ChangedBy { get; set; } = string.Empty;
    public DateTime ChangedAt { get; set; } = DateTime.UtcNow;
    public Dictionary<string, FieldChange> Changes { get; set; } = new();
    public string? Reason { get; set; } // Why the change was made
}

public class FieldChange
{
    public string FieldName { get; set; } = string.Empty;
    public string? OldValue { get; set; }
    public string? NewValue { get; set; }
}
```

**2. Change Tracking Service:**
```csharp
// Services/ChangeTracking/IChangeTrackingService.cs
public interface IChangeTrackingService
{
    Task TrackCreateAsync<T>(T entity, string userId, CancellationToken ct = default);
    Task TrackUpdateAsync<T>(T oldEntity, T newEntity, string userId, string? reason = null, CancellationToken ct = default);
    Task TrackDeleteAsync<T>(T entity, string userId, string? reason = null, CancellationToken ct = default);
    Task<IReadOnlyList<ChangeLog>> GetHistoryAsync(string entityId, CancellationToken ct = default);
}

// Services/ChangeTracking/ChangeTrackingService.cs
using System.Reflection;
using System.Text.Json;

public class ChangeTrackingService : IChangeTrackingService
{
    private readonly Container _changeLogContainer;
    private readonly ILogger<ChangeTrackingService> _logger;

    // Sensitive fields that should be masked in change logs (CNIL compliance)
    private static readonly HashSet<string> SensitiveFields = new(StringComparer.OrdinalIgnoreCase)
    {
        "Nir", "NirEncrypted", "Salary", "SalaryEncrypted",
        "Iban", "IbanEncrypted", "Password", "PasswordHash"
    };

    public ChangeTrackingService(CosmosClient client, IConfiguration config, ILogger<ChangeTrackingService> logger)
    {
        var database = config["CosmosDb:DatabaseName"];
        _changeLogContainer = client.GetContainer(database, "ChangeLogs");
        _logger = logger;
    }

    public async Task TrackCreateAsync<T>(T entity, string userId, CancellationToken ct = default)
    {
        var changeLog = new ChangeLog
        {
            EntityType = typeof(T).Name,
            EntityId = GetEntityId(entity),
            Action = "Create",
            ChangedBy = userId,
            ChangedAt = DateTime.UtcNow
        };

        await _changeLogContainer.CreateItemAsync(changeLog, cancellationToken: ct);
    }

    public async Task TrackUpdateAsync<T>(T oldEntity, T newEntity, string userId, string? reason = null, CancellationToken ct = default)
    {
        var changes = DetectChanges(oldEntity, newEntity);

        if (changes.Count == 0) return; // No actual changes

        var changeLog = new ChangeLog
        {
            EntityType = typeof(T).Name,
            EntityId = GetEntityId(newEntity),
            Action = "Update",
            ChangedBy = userId,
            ChangedAt = DateTime.UtcNow,
            Changes = changes,
            Reason = reason
        };

        await _changeLogContainer.CreateItemAsync(changeLog, cancellationToken: ct);
        _logger.LogInformation("Tracked {Count} changes to {EntityType} {EntityId} by {UserId}",
            changes.Count, typeof(T).Name, GetEntityId(newEntity), userId);
    }

    public async Task TrackDeleteAsync<T>(T entity, string userId, string? reason = null, CancellationToken ct = default)
    {
        var changeLog = new ChangeLog
        {
            EntityType = typeof(T).Name,
            EntityId = GetEntityId(entity),
            Action = "Delete",
            ChangedBy = userId,
            ChangedAt = DateTime.UtcNow,
            Reason = reason
        };

        await _changeLogContainer.CreateItemAsync(changeLog, cancellationToken: ct);
    }

    public async Task<IReadOnlyList<ChangeLog>> GetHistoryAsync(string entityId, CancellationToken ct = default)
    {
        var query = new QueryDefinition("SELECT * FROM c WHERE c.entityId = @entityId ORDER BY c.changedAt DESC")
            .WithParameter("@entityId", entityId);

        var results = new List<ChangeLog>();
        using var iterator = _changeLogContainer.GetItemQueryIterator<ChangeLog>(query);
        while (iterator.HasMoreResults)
        {
            var response = await iterator.ReadNextAsync(ct);
            results.AddRange(response.Resource);
        }
        return results;
    }

    private Dictionary<string, FieldChange> DetectChanges<T>(T oldEntity, T newEntity)
    {
        var changes = new Dictionary<string, FieldChange>();
        var properties = typeof(T).GetProperties(BindingFlags.Public | BindingFlags.Instance);

        foreach (var prop in properties)
        {
            var oldValue = prop.GetValue(oldEntity);
            var newValue = prop.GetValue(newEntity);

            if (!Equals(oldValue, newValue))
            {
                var isSensitive = SensitiveFields.Contains(prop.Name);
                changes[prop.Name] = new FieldChange
                {
                    FieldName = prop.Name,
                    OldValue = isSensitive ? "***MASQUE***" : oldValue?.ToString(),
                    NewValue = isSensitive ? "***MASQUE***" : newValue?.ToString()
                };
            }
        }

        return changes;
    }

    private string GetEntityId<T>(T entity)
    {
        var idProp = typeof(T).GetProperty("Id");
        return idProp?.GetValue(entity)?.ToString() ?? "unknown";
    }
}
```

**3. CosmosDB Change Feed Processor:**
```csharp
// Infrastructure/ChangeFeed/ChangeFeedProcessor.cs
using Microsoft.Azure.Cosmos;

public class ChangeFeedBackgroundService : BackgroundService
{
    private readonly CosmosClient _client;
    private readonly IConfiguration _config;
    private readonly ILogger<ChangeFeedBackgroundService> _logger;
    private ChangeFeedProcessor? _processor;

    public ChangeFeedBackgroundService(CosmosClient client, IConfiguration config, ILogger<ChangeFeedBackgroundService> logger)
    {
        _client = client;
        _config = config;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var database = _config["CosmosDb:DatabaseName"];
        var monitoredContainer = _client.GetContainer(database, "Candidates");
        var leaseContainer = _client.GetContainer(database, "Leases");

        _processor = monitoredContainer
            .GetChangeFeedProcessorBuilder<Candidate>("candidateChangeFeed", HandleChangesAsync)
            .WithInstanceName(Environment.MachineName)
            .WithLeaseContainer(leaseContainer)
            .WithStartTime(DateTime.UtcNow)
            .Build();

        await _processor.StartAsync();
        _logger.LogInformation("Change Feed processor started");

        await Task.Delay(Timeout.Infinite, stoppingToken);
    }

    private async Task HandleChangesAsync(
        ChangeFeedProcessorContext context,
        IReadOnlyCollection<Candidate> changes,
        CancellationToken cancellationToken)
    {
        foreach (var change in changes)
        {
            _logger.LogInformation("Change detected: {EntityId} at {Timestamp}",
                change.Id, DateTime.UtcNow);

            // Push to event bus, notification system, etc.
            // await _eventPublisher.PublishAsync(new CandidateChangedEvent(change));
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        if (_processor != null) await _processor.StopAsync();
        await base.StopAsync(cancellationToken);
    }
}
```

### Node.js/TypeScript

```typescript
// services/changeTrackingService.ts
interface ChangeLog {
  id: string;
  entityType: string;
  entityId: string;
  action: 'Create' | 'Update' | 'Delete';
  changedBy: string;
  changedAt: Date;
  changes: Record<string, { oldValue?: string; newValue?: string }>;
  reason?: string;
}

export class ChangeTrackingService {
  private sensitiveFields = new Set(['nir', 'salary', 'iban', 'password']);

  async trackUpdate<T extends Record<string, any>>(
    oldEntity: T, newEntity: T, userId: string, reason?: string
  ): Promise<void> {
    const changes: Record<string, any> = {};

    for (const key of Object.keys(oldEntity)) {
      if (oldEntity[key] !== newEntity[key]) {
        changes[key] = {
          oldValue: this.sensitiveFields.has(key.toLowerCase()) ? '***MASQUE***' : String(oldEntity[key]),
          newValue: this.sensitiveFields.has(key.toLowerCase()) ? '***MASQUE***' : String(newEntity[key])
        };
      }
    }

    if (Object.keys(changes).length === 0) return;

    const log: ChangeLog = {
      id: crypto.randomUUID(),
      entityType: newEntity.constructor.name,
      entityId: newEntity.id,
      action: 'Update',
      changedBy: userId,
      changedAt: new Date(),
      changes,
      reason
    };

    await this.container.items.create(log);
  }
}
```

## CNIL / GDPR Compliance

- Sensitive fields (NIR, salary) are MASKED in change logs
- Full audit trail of who changed what, when
- Data retention: ChangeLogs stored for minimum 5 years (payroll data)
- Access to change logs restricted to DPO and authorized personnel

## Testing

```csharp
[Fact]
public async Task TrackUpdate_DetectsChanges()
{
    var old = new Candidate { Id = "1", FirstName = "Jean", LastName = "Dupont" };
    var updated = new Candidate { Id = "1", FirstName = "Pierre", LastName = "Dupont" };

    await _service.TrackUpdateAsync(old, updated, "admin-1");

    var history = await _service.GetHistoryAsync("1");
    Assert.Single(history);
    Assert.Contains("FirstName", history[0].Changes.Keys);
    Assert.Equal("Jean", history[0].Changes["FirstName"].OldValue);
    Assert.Equal("Pierre", history[0].Changes["FirstName"].NewValue);
}

[Fact]
public async Task TrackUpdate_MasksSensitiveFields()
{
    var old = new Employee { Id = "1", NirEncrypted = "old-encrypted" };
    var updated = new Employee { Id = "1", NirEncrypted = "new-encrypted" };

    await _service.TrackUpdateAsync(old, updated, "admin-1");

    var history = await _service.GetHistoryAsync("1");
    Assert.Equal("***MASQUE***", history[0].Changes["NirEncrypted"].OldValue);
}
```

## Related Skills

- `/add-audit-fields` - Add CreatedAt/UpdatedAt audit fields
- `/implement-soft-deletes` - Soft delete with tracking
- `/add-data-encryption` - Encrypt sensitive change log data
