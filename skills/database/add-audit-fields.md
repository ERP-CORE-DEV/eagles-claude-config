---
name: add-audit-fields
description: Add audit fields (CreatedAt, CreatedBy, UpdatedAt, UpdatedBy) to entities for CNIL compliance tracking
argument-hint: "[audit-level] [storage-strategy]"
tags: [database, audit, cnil, gdpr, tracking, compliance]
---

# Add Audit Fields

Adds audit tracking fields to all entities for CNIL/GDPR compliance, automatically populating CreatedAt, CreatedBy, UpdatedAt, UpdatedBy on every operation.

## When to Use

**Use audit fields when:**
- CNIL compliance requires tracking who accessed/modified personal data
- GDPR Article 30: Recording processing activities
- Code du travail: Tracking employment data modifications
- French HR: Any system handling employee PII (NIR, salary, health data)
- RH-OptimERP: MANDATORY for all entities with personal data

**Minimal fields for compliance:**
- `CreatedAt` (DateTime UTC)
- `CreatedBy` (User ID who created)
- `UpdatedAt` (DateTime UTC, nullable)
- `UpdatedBy` (User ID who last modified, nullable)
- Optional: `DeletedAt`, `DeletedBy` (soft delete)

## Implementation

### .NET 8 (CosmosDB)

**1. Audit Interface:**
```csharp
// Domain/Interfaces/IAuditable.cs
namespace Sourcing.CandidateAttraction.Domain.Interfaces
{
    public interface IAuditable
    {
        DateTime CreatedAt { get; set; }
        string CreatedBy { get; set; }
        DateTime? UpdatedAt { get; set; }
        string? UpdatedBy { get; set; }
    }

    public interface ISoftDeletable : IAuditable
    {
        bool IsDeleted { get; set; }
        DateTime? DeletedAt { get; set; }
        string? DeletedBy { get; set; }
    }
}
```

**2. Base Entity:**
```csharp
// Domain/Models/BaseEntity.cs
namespace Sourcing.CandidateAttraction.Domain.Models
{
    public abstract class BaseEntity : IAuditable
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public DateTime CreatedAt { get; set; }
        public string CreatedBy { get; set; } = string.Empty;
        public DateTime? UpdatedAt { get; set; }
        public string? UpdatedBy { get; set; }
    }

    public abstract class SoftDeletableEntity : BaseEntity, ISoftDeletable
    {
        public bool IsDeleted { get; set; }
        public DateTime? DeletedAt { get; set; }
        public string? DeletedBy { get; set; }
    }
}

// Usage:
public class Candidate : SoftDeletableEntity
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    // ... other fields
}
```

**3. Automatic Audit Population (Middleware):**
```csharp
// Infrastructure/Repositories/AuditInterceptor.cs
public class AuditInterceptor
{
    private readonly IHttpContextAccessor _httpContext;

    public AuditInterceptor(IHttpContextAccessor httpContext)
    {
        _httpContext = httpContext;
    }

    private string GetCurrentUserId()
    {
        return _httpContext.HttpContext?.User.FindFirst("user_id")?.Value ?? "system";
    }

    public void SetCreateAuditFields<T>(T entity) where T : IAuditable
    {
        entity.CreatedAt = DateTime.UtcNow;
        entity.CreatedBy = GetCurrentUserId();
    }

    public void SetUpdateAuditFields<T>(T entity) where T : IAuditable
    {
        entity.UpdatedAt = DateTime.UtcNow;
        entity.UpdatedBy = GetCurrentUserId();
    }

    public void SetDeleteAuditFields<T>(T entity) where T : ISoftDeletable
    {
        entity.IsDeleted = true;
        entity.DeletedAt = DateTime.UtcNow;
        entity.DeletedBy = GetCurrentUserId();
    }
}
```

**4. Auditable Repository:**
```csharp
// Infrastructure/Repositories/AuditableCosmosRepository.cs
public class AuditableCosmosRepository<T> : CosmosRepository<T> where T : class, IAuditable
{
    private readonly AuditInterceptor _auditInterceptor;

    public AuditableCosmosRepository(
        CosmosClient client,
        IConfiguration config,
        ILogger<AuditableCosmosRepository<T>> logger,
        AuditInterceptor auditInterceptor)
        : base(client, config, logger)
    {
        _auditInterceptor = auditInterceptor;
    }

    public override async Task<T> CreateAsync(T entity, CancellationToken ct = default)
    {
        _auditInterceptor.SetCreateAuditFields(entity);
        return await base.CreateAsync(entity, ct);
    }

    public override async Task<T> UpdateAsync(T entity, CancellationToken ct = default)
    {
        _auditInterceptor.SetUpdateAuditFields(entity);
        return await base.UpdateAsync(entity, ct);
    }
}
```

### Node.js/TypeScript

```typescript
// domain/interfaces/IAuditable.ts
export interface IAuditable {
  createdAt: Date;
  createdBy: string;
  updatedAt?: Date;
  updatedBy?: string;
}

export interface ISoftDeletable extends IAuditable {
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: string;
}

// infrastructure/middleware/auditMiddleware.ts
import { Request, Response, NextFunction } from 'express';

export function auditMiddleware(req: Request, _res: Response, next: NextFunction) {
  const userId = (req as any).user?.userId || 'system';
  (req as any).auditContext = {
    userId,
    timestamp: new Date()
  };
  next();
}

// Use in repository:
async create(entity: T, userId: string): Promise<T> {
  entity.createdAt = new Date();
  entity.createdBy = userId;
  const { resource } = await this.container.items.create(entity);
  return resource as T;
}
```

## French HR / CNIL Compliance

**Required by CNIL:**
- Track ALL modifications to personal data (NIR, salary, address)
- Log user identity for each operation
- Retain audit records for minimum 3 years (payroll), 5 years (social security)
- Audit fields must not be modifiable by end users

**Data Retention:**
```csharp
public static class RetentionPolicies
{
    public static readonly TimeSpan Payroll = TimeSpan.FromDays(365 * 5);      // 5 years
    public static readonly TimeSpan SocialSecurity = TimeSpan.FromDays(365 * 5); // 5 years
    public static readonly TimeSpan TimeAttendance = TimeSpan.FromDays(365);     // 1 year
    public static readonly TimeSpan Recruitment = TimeSpan.FromDays(365 * 2);    // 2 years
    public static readonly TimeSpan MedicalRecords = TimeSpan.FromDays(365 * 50); // 50 years
}
```

## Testing

```csharp
[Fact]
public async Task CreateAsync_SetsAuditFields()
{
    var entity = new Candidate { FirstName = "Jean", LastName = "Dupont" };
    var result = await _repository.CreateAsync(entity);

    Assert.True(result.CreatedAt > DateTime.MinValue);
    Assert.Equal("test-user", result.CreatedBy);
    Assert.Null(result.UpdatedAt);
}

[Fact]
public async Task UpdateAsync_SetsUpdateFields()
{
    var entity = await _repository.GetByIdAsync("existing-id");
    entity.FirstName = "Pierre";

    var result = await _repository.UpdateAsync(entity);

    Assert.NotNull(result.UpdatedAt);
    Assert.Equal("test-user", result.UpdatedBy);
}
```

## Related Skills

- `/implement-change-tracking` - Track field-level changes
- `/implement-soft-deletes` - Soft delete with audit trail
- `/add-data-encryption` - Encrypt sensitive audit data
