---
name: implement-repository-pattern
description: Implement repository pattern for data access abstraction
argument-hint: [database: cosmos|postgres|mongodb|sqlserver]
tags: [backend, repository, data-access, pattern, SOLID]
---

# Repository Pattern Guide

The repository pattern abstracts data access, enabling testability and database independence.

---

## Generic Repository Interface

```csharp
public interface IRepository<T> where T : class, IEntity
{
    Task<T?> GetByIdAsync(string id);
    Task<IEnumerable<T>> GetAllAsync();
    Task<PagedResult<T>> GetPagedAsync(int page, int pageSize);
    Task<T> CreateAsync(T entity);
    Task UpdateAsync(T entity);
    Task DeleteAsync(string id);
}

public interface IEntity
{
    string Id { get; set; }
    DateTime CreatedAt { get; set; }
    DateTime? UpdatedAt { get; set; }
}

public class PagedResult<T>
{
    public IReadOnlyList<T> Items { get; init; } = new List<T>();
    public int TotalCount { get; init; }
    public int Page { get; init; }
    public int PageSize { get; init; }
    public int TotalPages => (int)Math.Ceiling((double)TotalCount / PageSize);
    public bool HasNextPage => Page < TotalPages;
}
```

---

## CosmosDB Implementation

```csharp
public class CosmosRepository<T> : IRepository<T> where T : class, IEntity
{
    private readonly Container _container;

    public CosmosRepository(CosmosClient client, string database, string containerName)
        => _container = client.GetContainer(database, containerName);

    public async Task<T?> GetByIdAsync(string id)
    {
        try { return (await _container.ReadItemAsync<T>(id, new PartitionKey(id))).Resource; }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.NotFound) { return null; }
    }

    public async Task<PagedResult<T>> GetPagedAsync(int page, int pageSize)
    {
        var query = _container.GetItemQueryIterator<T>(
            new QueryDefinition("SELECT * FROM c ORDER BY c.createdAt DESC OFFSET @offset LIMIT @limit")
                .WithParameter("@offset", (page - 1) * pageSize)
                .WithParameter("@limit", pageSize));

        var items = new List<T>();
        while (query.HasMoreResults)
            items.AddRange((await query.ReadNextAsync()).Resource);

        return new PagedResult<T> { Items = items, Page = page, PageSize = pageSize };
    }

    public async Task<T> CreateAsync(T entity)
    {
        entity.Id = Guid.NewGuid().ToString();
        entity.CreatedAt = DateTime.UtcNow;
        return (await _container.CreateItemAsync(entity, new PartitionKey(entity.Id))).Resource;
    }

    public async Task UpdateAsync(T entity)
    {
        entity.UpdatedAt = DateTime.UtcNow;
        await _container.UpsertItemAsync(entity, new PartitionKey(entity.Id));
    }

    public async Task DeleteAsync(string id)
        => await _container.DeleteItemAsync<T>(id, new PartitionKey(id));
}
```

---

## Entity-Specific Repository

```csharp
public interface ICandidateRepository : IRepository<Candidate>
{
    Task<IEnumerable<Candidate>> GetBySkillAsync(string skill);
    Task<IEnumerable<Candidate>> SearchAsync(string query);
}

public class CandidateRepository : CosmosRepository<Candidate>, ICandidateRepository
{
    public CandidateRepository(CosmosClient client)
        : base(client, "RecruitmentDb", "candidates") { }

    public async Task<IEnumerable<Candidate>> GetBySkillAsync(string skill)
    {
        var query = new QueryDefinition("SELECT * FROM c WHERE ARRAY_CONTAINS(c.skills, @skill)")
            .WithParameter("@skill", skill);
        // ... execute query
    }
}
```

---

## Unit of Work

```csharp
public interface IUnitOfWork : IDisposable
{
    ICandidateRepository Candidates { get; }
    IJobOfferRepository JobOffers { get; }
    Task<int> SaveChangesAsync();
}
```

---

## TypeScript Repository

```typescript
interface IRepository<T extends { id: string }> {
  getById(id: string): Promise<T | null>;
  getAll(): Promise<T[]>;
  create(entity: Omit<T, 'id'>): Promise<T>;
  update(id: string, entity: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}

class MongoRepository<T extends { id: string }> implements IRepository<T> {
  constructor(private collection: Collection<T>) {}

  async getById(id: string) { return this.collection.findOne({ _id: id } as any) as T | null; }
  async getAll() { return this.collection.find({}).toArray() as unknown as T[]; }
  async create(entity: Omit<T, 'id'>) {
    const result = await this.collection.insertOne({ ...entity, _id: new ObjectId() } as any);
    return { ...entity, id: result.insertedId.toString() } as T;
  }
}
```

---

## Registration

```csharp
builder.Services.AddScoped<ICandidateRepository, CandidateRepository>();
builder.Services.AddScoped<IJobOfferRepository, JobOfferRepository>();
builder.Services.AddScoped(typeof(IRepository<>), typeof(CosmosRepository<>));
```
