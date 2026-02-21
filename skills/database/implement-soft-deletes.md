---
name: implement-soft-deletes
description: Implement soft delete pattern with IsDeleted flag, query filters, and GDPR-aware retention
argument-hint: [stack: dotnet|node|python] [database: cosmosdb|postgres|sqlserver]
tags: [database, soft-delete, GDPR, data-retention, query-filters, audit]
---

# Soft Delete Implementation Guide

Soft deletes mark records as deleted without removing them. Required for: audit trails, GDPR retention periods, undo functionality.

---

## 1. .NET 8 (EF Core Global Query Filters)

### Entity Base

```csharp
public interface ISoftDeletable
{
    bool IsDeleted { get; set; }
    DateTime? DeletedAt { get; set; }
    string? DeletedBy { get; set; }
}

public abstract class BaseEntity : ISoftDeletable
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
    public string? DeletedBy { get; set; }
}
```

### Global Query Filter

```csharp
public class AppDbContext : DbContext
{
    protected override void OnModelCreating(ModelBuilder builder)
    {
        // Apply soft delete filter to ALL ISoftDeletable entities
        foreach (var entityType in builder.Model.GetEntityTypes())
        {
            if (typeof(ISoftDeletable).IsAssignableFrom(entityType.ClrType))
            {
                var parameter = Expression.Parameter(entityType.ClrType, "e");
                var property = Expression.Property(parameter, nameof(ISoftDeletable.IsDeleted));
                var filter = Expression.Lambda(Expression.Not(property), parameter);
                builder.Entity(entityType.ClrType).HasQueryFilter(filter);
            }
        }
    }

    public override Task<int> SaveChangesAsync(CancellationToken ct = default)
    {
        foreach (var entry in ChangeTracker.Entries<ISoftDeletable>()
            .Where(e => e.State == EntityState.Deleted))
        {
            entry.State = EntityState.Modified;
            entry.Entity.IsDeleted = true;
            entry.Entity.DeletedAt = DateTime.UtcNow;
        }
        return base.SaveChangesAsync(ct);
    }
}
```

### Query Including Deleted

```csharp
// Normal query (soft-deleted excluded automatically)
var candidates = await _context.Candidates.ToListAsync();

// Include soft-deleted (admin view, audit)
var allCandidates = await _context.Candidates.IgnoreQueryFilters().ToListAsync();

// Only soft-deleted (recovery view)
var deleted = await _context.Candidates.IgnoreQueryFilters()
    .Where(c => c.IsDeleted).ToListAsync();
```

---

## 2. CosmosDB (No Global Filters)

```csharp
public class CandidateRepository : ICandidateRepository
{
    public async Task<List<Candidate>> GetAllAsync()
    {
        var query = _container.GetItemLinqQueryable<Candidate>()
            .Where(c => !c.IsDeleted);  // Must add filter manually every time
        return await query.ToListAsync();
    }

    public async Task SoftDeleteAsync(string id, string deletedBy)
    {
        var candidate = await GetByIdAsync(id);
        candidate.IsDeleted = true;
        candidate.DeletedAt = DateTime.UtcNow;
        candidate.DeletedBy = deletedBy;
        await _container.UpsertItemAsync(candidate, new PartitionKey(id));
    }

    public async Task HardDeleteAsync(string id)
        => await _container.DeleteItemAsync<Candidate>(id, new PartitionKey(id));
}
```

---

## 3. TypeScript (Prisma Middleware)

```typescript
// prisma middleware for automatic soft delete
prisma.$use(async (params, next) => {
  if (params.action === 'delete') {
    params.action = 'update';
    params.args.data = { isDeleted: true, deletedAt: new Date() };
  }
  if (params.action === 'deleteMany') {
    params.action = 'updateMany';
    params.args.data = { isDeleted: true, deletedAt: new Date() };
  }
  // Auto-filter on reads
  if (['findFirst', 'findMany', 'findUnique', 'count'].includes(params.action)) {
    if (!params.args.where) params.args.where = {};
    params.args.where.isDeleted = false;
  }
  return next(params);
});
```

---

## GDPR Retention & Hard Delete

```csharp
// Background job: hard-delete after retention period
public class GdprCleanupJob(AppDbContext context, ILogger<GdprCleanupJob> logger)
{
    public async Task ExecuteAsync(CancellationToken ct)
    {
        var cutoff = DateTime.UtcNow.AddYears(-2);  // 2-year retention
        var expired = await context.Candidates
            .IgnoreQueryFilters()
            .Where(c => c.IsDeleted && c.DeletedAt < cutoff)
            .ToListAsync(ct);

        logger.LogInformation("GDPR cleanup: {Count} candidates past retention", expired.Count);
        context.Candidates.RemoveRange(expired);  // True hard delete
        await context.SaveChangesAsync(ct);
    }
}
```

---

## Decision Matrix

| Approach | When | Trade-off |
|----------|------|-----------|
| Soft delete (IsDeleted flag) | Audit trail needed, undo support | Query complexity, storage growth |
| Hard delete | GDPR erasure, no audit needed | Data loss is permanent |
| Tombstone + archive | Long retention + compliance | Two-phase: soft delete → archive → hard delete |
| Event sourcing | Full history required | Complex, but natural soft delete via events |


## Note: Contexte RH Francais

En droit du travail francais, la suppression logique (soft delete) est **obligatoire** pour les donnees de candidats et employes. La CNIL impose une conservation des donnees de recrutement pendant 2 ans minimum, et les donnees de paie pendant 5 ans. La suppression physique avant ces delais constitue une infraction. Le champ `IsAnonymized` permet de rendre les donnees GDPR-conformes tout en conservant les enregistrements pour l'audit.
