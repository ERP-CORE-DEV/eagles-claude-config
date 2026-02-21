---
name: add-repository-unitofwork
description: Implement Repository and Unit of Work patterns for data access abstraction with CosmosDB transactional batch
argument-hint: "[db-provider] [transaction-scope]"
tags: [architecture-patterns, repository, unit-of-work, data-access, cosmos-db]
---

# Add Repository & Unit of Work Pattern

Implements the Repository pattern for data access abstraction and Unit of Work for transactional consistency, with CosmosDB SDK direct (not EF Core) integration.

## When to Use

**Use Repository + UoW when:**
- Need to abstract data access from business logic
- Multiple operations must be atomic (transactional batch)
- Testing requires easy mocking of data access
- Switching databases must not affect business layer
- RH-OptimERP: This IS the standard pattern for all microservices

**Avoid when:**
- Trivial CRUD with no business logic (direct DB access is fine)
- Using EF Core which has built-in Repository/UoW via DbContext

## Implementation

### .NET 8 (CosmosDB SDK - RH-OptimERP Standard)

**1. Generic Repository Interface:**
```csharp
// Domain/Interfaces/IRepository.cs
namespace Sourcing.CandidateAttraction.Domain.Interfaces
{
    public interface IRepository<T> where T : class
    {
        Task<T?> GetByIdAsync(string id, CancellationToken ct = default);
        Task<PagedResult<T>> GetAllAsync(int page, int pageSize, CancellationToken ct = default);
        Task<T> CreateAsync(T entity, CancellationToken ct = default);
        Task<T> UpdateAsync(T entity, CancellationToken ct = default);
        Task DeleteAsync(string id, CancellationToken ct = default);
        Task<bool> ExistsAsync(string id, CancellationToken ct = default);
    }

    public record PagedResult<T>(
        IReadOnlyList<T> Items,
        int TotalCount,
        int Page,
        int PageSize
    )
    {
        public int TotalPages => (int)Math.Ceiling(TotalCount / (double)PageSize);
        public bool HasNext => Page < TotalPages;
        public bool HasPrevious => Page > 1;
    }
}
```

**2. Generic CosmosDB Repository:**
```csharp
// Infrastructure/Repositories/CosmosRepository.cs
using Microsoft.Azure.Cosmos;
using System.Net;

namespace Sourcing.CandidateAttraction.Infrastructure.Repositories
{
    public class CosmosRepository<T> : IRepository<T> where T : class
    {
        protected readonly Container _container;
        protected readonly ILogger<CosmosRepository<T>> _logger;

        public CosmosRepository(CosmosClient cosmosClient, IConfiguration config, ILogger<CosmosRepository<T>> logger)
        {
            var dbName = config["CosmosDb:DatabaseName"];
            var containerName = typeof(T).Name + "s"; // Convention: pluralize entity name
            _container = cosmosClient.GetContainer(dbName, containerName);
            _logger = logger;
        }

        public virtual async Task<T?> GetByIdAsync(string id, CancellationToken ct = default)
        {
            try
            {
                var response = await _container.ReadItemAsync<T>(id, new PartitionKey(id), cancellationToken: ct);
                return response.Resource;
            }
            catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
            {
                return null;
            }
        }

        public virtual async Task<PagedResult<T>> GetAllAsync(int page, int pageSize, CancellationToken ct = default)
        {
            // Count total
            var countQuery = new QueryDefinition("SELECT VALUE COUNT(1) FROM c");
            using var countIterator = _container.GetItemQueryIterator<int>(countQuery);
            var countResponse = await countIterator.ReadNextAsync(ct);
            var totalCount = countResponse.FirstOrDefault();

            // Get page
            var query = new QueryDefinition("SELECT * FROM c ORDER BY c._ts DESC OFFSET @offset LIMIT @limit")
                .WithParameter("@offset", (page - 1) * pageSize)
                .WithParameter("@limit", pageSize);

            var items = new List<T>();
            using var iterator = _container.GetItemQueryIterator<T>(query);
            while (iterator.HasMoreResults)
            {
                var response = await iterator.ReadNextAsync(ct);
                items.AddRange(response.Resource);
            }

            return new PagedResult<T>(items, totalCount, page, pageSize);
        }

        public virtual async Task<T> CreateAsync(T entity, CancellationToken ct = default)
        {
            var response = await _container.CreateItemAsync(entity, cancellationToken: ct);
            _logger.LogInformation("Created {EntityType} (RU cost: {RuCost})", typeof(T).Name, response.RequestCharge);
            return response.Resource;
        }

        public virtual async Task<T> UpdateAsync(T entity, CancellationToken ct = default)
        {
            var response = await _container.UpsertItemAsync(entity, cancellationToken: ct);
            _logger.LogInformation("Updated {EntityType} (RU cost: {RuCost})", typeof(T).Name, response.RequestCharge);
            return response.Resource;
        }

        public virtual async Task DeleteAsync(string id, CancellationToken ct = default)
        {
            await _container.DeleteItemAsync<T>(id, new PartitionKey(id), cancellationToken: ct);
            _logger.LogInformation("Deleted {EntityType} with ID {Id}", typeof(T).Name, id);
        }

        public virtual async Task<bool> ExistsAsync(string id, CancellationToken ct = default)
        {
            var entity = await GetByIdAsync(id, ct);
            return entity != null;
        }
    }
}
```

**3. Specialized Repository:**
```csharp
// Domain/Interfaces/ICandidateRepository.cs
public interface ICandidateRepository : IRepository<Candidate>
{
    Task<IReadOnlyList<Candidate>> GetBySkillAsync(string skill, CancellationToken ct = default);
    Task<Candidate?> GetByEmailAsync(string email, CancellationToken ct = default);
    Task<IReadOnlyList<Candidate>> SearchAsync(string query, CancellationToken ct = default);
}

// Infrastructure/Repositories/CandidateRepository.cs
public class CandidateRepository : CosmosRepository<Candidate>, ICandidateRepository
{
    public CandidateRepository(CosmosClient cosmosClient, IConfiguration config, ILogger<CandidateRepository> logger)
        : base(cosmosClient, config, logger) { }

    public async Task<IReadOnlyList<Candidate>> GetBySkillAsync(string skill, CancellationToken ct = default)
    {
        var query = new QueryDefinition("SELECT * FROM c WHERE ARRAY_CONTAINS(c.skills, @skill)")
            .WithParameter("@skill", skill);

        var results = new List<Candidate>();
        using var iterator = _container.GetItemQueryIterator<Candidate>(query);
        while (iterator.HasMoreResults)
        {
            var response = await iterator.ReadNextAsync(ct);
            results.AddRange(response.Resource);
        }
        return results;
    }

    public async Task<Candidate?> GetByEmailAsync(string email, CancellationToken ct = default)
    {
        var query = new QueryDefinition("SELECT * FROM c WHERE c.email = @email")
            .WithParameter("@email", email.ToLowerInvariant());

        using var iterator = _container.GetItemQueryIterator<Candidate>(query);
        var response = await iterator.ReadNextAsync(ct);
        return response.FirstOrDefault();
    }

    public async Task<IReadOnlyList<Candidate>> SearchAsync(string searchQuery, CancellationToken ct = default)
    {
        var query = new QueryDefinition(
            "SELECT * FROM c WHERE CONTAINS(LOWER(c.firstName), @q) OR CONTAINS(LOWER(c.lastName), @q) OR CONTAINS(LOWER(c.email), @q)")
            .WithParameter("@q", searchQuery.ToLowerInvariant());

        var results = new List<Candidate>();
        using var iterator = _container.GetItemQueryIterator<Candidate>(query);
        while (iterator.HasMoreResults)
        {
            var response = await iterator.ReadNextAsync(ct);
            results.AddRange(response.Resource);
        }
        return results;
    }
}
```

**4. Unit of Work (CosmosDB Transactional Batch):**
```csharp
// Domain/Interfaces/IUnitOfWork.cs
public interface IUnitOfWork : IDisposable
{
    ICandidateRepository Candidates { get; }
    IJobPostingRepository JobPostings { get; }
    Task<int> SaveChangesAsync(CancellationToken ct = default);
}

// Infrastructure/UnitOfWork/CosmosUnitOfWork.cs
using Microsoft.Azure.Cosmos;

public class CosmosUnitOfWork : IUnitOfWork
{
    private readonly CosmosClient _client;
    private readonly IConfiguration _config;
    private readonly ILoggerFactory _loggerFactory;
    private readonly List<Func<TransactionalBatch, TransactionalBatch>> _operations = new();

    public ICandidateRepository Candidates { get; }
    public IJobPostingRepository JobPostings { get; }

    public CosmosUnitOfWork(CosmosClient client, IConfiguration config, ILoggerFactory loggerFactory)
    {
        _client = client;
        _config = config;
        _loggerFactory = loggerFactory;

        Candidates = new CandidateRepository(client, config, loggerFactory.CreateLogger<CandidateRepository>());
        JobPostings = new JobPostingRepository(client, config, loggerFactory.CreateLogger<JobPostingRepository>());
    }

    public async Task<int> SaveChangesAsync(CancellationToken ct = default)
    {
        // CosmosDB transactional batch (same partition key required)
        if (_operations.Count == 0) return 0;

        var database = _config["CosmosDb:DatabaseName"];
        var container = _client.GetContainer(database, "Operations");

        var batch = container.CreateTransactionalBatch(new PartitionKey("batch"));
        foreach (var operation in _operations)
        {
            batch = operation(batch);
        }

        var response = await batch.ExecuteAsync(ct);

        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException($"Transaction failed: {response.StatusCode}");

        var count = _operations.Count;
        _operations.Clear();
        return count;
    }

    public void Dispose() { _operations.Clear(); }
}
```

**5. DI Registration:**
```csharp
// Program.cs
builder.Services.AddSingleton(sp =>
{
    var connectionString = sp.GetRequiredService<IConfiguration>()["CosmosDb:ConnectionString"];
    return new CosmosClient(connectionString, new CosmosClientOptions
    {
        SerializerOptions = new CosmosSerializationOptions
        {
            PropertyNamingPolicy = CosmosPropertyNamingPolicy.CamelCase
        }
    });
});

builder.Services.AddScoped<ICandidateRepository, CandidateRepository>();
builder.Services.AddScoped<IJobPostingRepository, JobPostingRepository>();
builder.Services.AddScoped<IUnitOfWork, CosmosUnitOfWork>();
```

### Node.js/TypeScript

```typescript
// domain/interfaces/IRepository.ts
export interface IRepository<T> {
  getById(id: string): Promise<T | null>;
  getAll(page: number, pageSize: number): Promise<PagedResult<T>>;
  create(entity: T): Promise<T>;
  update(entity: T): Promise<T>;
  delete(id: string): Promise<void>;
  exists(id: string): Promise<boolean>;
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// infrastructure/repositories/CosmosRepository.ts
import { Container, CosmosClient } from '@azure/cosmos';
import { IRepository, PagedResult } from '../../domain/interfaces/IRepository';

export class CosmosRepository<T extends { id: string }> implements IRepository<T> {
  protected container: Container;

  constructor(cosmosClient: CosmosClient, databaseName: string, containerName: string) {
    this.container = cosmosClient.database(databaseName).container(containerName);
  }

  async getById(id: string): Promise<T | null> {
    try {
      const { resource } = await this.container.item(id, id).read<T>();
      return resource ?? null;
    } catch (error: any) {
      if (error.code === 404) return null;
      throw error;
    }
  }

  async getAll(page: number, pageSize: number): Promise<PagedResult<T>> {
    const offset = (page - 1) * pageSize;
    const { resources } = await this.container.items
      .query<T>(`SELECT * FROM c ORDER BY c._ts DESC OFFSET ${offset} LIMIT ${pageSize}`)
      .fetchAll();

    const { resources: countResult } = await this.container.items
      .query<number>('SELECT VALUE COUNT(1) FROM c')
      .fetchAll();

    const totalCount = countResult[0] || 0;

    return {
      items: resources,
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize)
    };
  }

  async create(entity: T): Promise<T> {
    const { resource } = await this.container.items.create(entity);
    return resource as T;
  }

  async update(entity: T): Promise<T> {
    const { resource } = await this.container.items.upsert(entity);
    return resource as T;
  }

  async delete(id: string): Promise<void> {
    await this.container.item(id, id).delete();
  }

  async exists(id: string): Promise<boolean> {
    return (await this.getById(id)) !== null;
  }
}
```

## French HR / CNIL Compliance

```csharp
// Audit-aware repository base class
public abstract class AuditableCosmosRepository<T> : CosmosRepository<T> where T : class, IAuditable
{
    private readonly IHttpContextAccessor _httpContext;

    protected AuditableCosmosRepository(CosmosClient client, IConfiguration config,
        ILogger logger, IHttpContextAccessor httpContext)
        : base(client, config, logger)
    {
        _httpContext = httpContext;
    }

    public override async Task<T> CreateAsync(T entity, CancellationToken ct = default)
    {
        var userId = _httpContext.HttpContext?.User.FindFirst("user_id")?.Value ?? "system";
        entity.CreatedBy = userId;
        entity.CreatedAt = DateTime.UtcNow;
        return await base.CreateAsync(entity, ct);
    }

    public override async Task<T> UpdateAsync(T entity, CancellationToken ct = default)
    {
        var userId = _httpContext.HttpContext?.User.FindFirst("user_id")?.Value ?? "system";
        entity.UpdatedBy = userId;
        entity.UpdatedAt = DateTime.UtcNow;
        return await base.UpdateAsync(entity, ct);
    }
}
```

## Testing

```csharp
[Fact]
public async Task GetByIdAsync_ExistingEntity_ReturnsEntity()
{
    // Arrange
    var mockContainer = new Mock<Container>();
    var candidate = new Candidate { Id = "123", FirstName = "Jean" };
    mockContainer.Setup(c => c.ReadItemAsync<Candidate>("123", It.IsAny<PartitionKey>(), null, default))
        .ReturnsAsync(Mock.Of<ItemResponse<Candidate>>(r => r.Resource == candidate));

    var repository = new CandidateRepository(mockContainer.Object);

    // Act
    var result = await repository.GetByIdAsync("123");

    // Assert
    Assert.NotNull(result);
    Assert.Equal("Jean", result.FirstName);
}

[Fact]
public async Task GetByIdAsync_NonExisting_ReturnsNull()
{
    var mockContainer = new Mock<Container>();
    mockContainer.Setup(c => c.ReadItemAsync<Candidate>(It.IsAny<string>(), It.IsAny<PartitionKey>(), null, default))
        .ThrowsAsync(new CosmosException("Not found", HttpStatusCode.NotFound, 0, "", 0));

    var repository = new CandidateRepository(mockContainer.Object);

    var result = await repository.GetByIdAsync("nonexistent");

    Assert.Null(result);
}
```

## Related Skills

- `/implement-clean-architecture` - Full Clean Architecture implementation
- `/add-audit-fields` - Add audit tracking to entities
- `/implement-change-tracking` - Track data changes for CNIL compliance


## Note: Contexte RH Francais

Le pattern Repository dans les systemes RH francais doit integrer la conformite CNIL : chaque operation CRUD sur les donnees personnelles (candidats, employes) est automatiquement auditee via les champs CreatedBy/UpdatedBy. Le Unit of Work garantit l'atomicite des operations de paie et de contrat de travail, essentielles pour la conformite avec le Code du travail.
