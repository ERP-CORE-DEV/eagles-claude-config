---
name: design-pagination
description: Implement API pagination with offset, cursor, or page-based approaches
argument-hint: [type: offset|cursor|page]
---

# API Pagination Design

## Offset Pagination
```
GET /api/products?offset=20&limit=10
Response: { items: [...], total: 500, offset: 20, limit: 10 }
```

## Cursor Pagination (Best for large datasets)
```
GET /api/products?cursor=eyJpZCI6MTIzfQ&limit=10
Response: { items: [...], nextCursor: "eyJpZCI6MTMzfQ", hasMore: true }
```

## Page-Based Pagination
```
GET /api/products?page=3&pageSize=10
Response: { items: [...], page: 3, pageSize: 10, totalPages: 50, totalCount: 500 }
```

## Implementation (.NET)
```csharp
public class PagedResult<T>
{
    public List<T> Items { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
    public int TotalCount { get; set; }
    public int TotalPages => (int)Math.Ceiling(TotalCount / (double)PageSize);
    public bool HasNextPage => Page < TotalPages;
    public bool HasPreviousPage => Page > 1;
}

[HttpGet]
public async Task<PagedResult<Product>> GetProducts(
    [FromQuery] int page = 1,
    [FromQuery] int pageSize = 20)
{
    var query = _context.Products.AsQueryable();
    var totalCount = await query.CountAsync();
    var items = await query
        .Skip((page - 1) * pageSize)
        .Take(pageSize)
        .ToListAsync();

    return new PagedResult<Product>
    {
        Items = items,
        Page = page,
        PageSize = pageSize,
        TotalCount = totalCount
    };
}
```


## French HR Context

Pagination in French HR systems handles:
- Candidate listings (100K+ records)
- Employee directories (multi-company)
- Audit logs (CNIL compliance - paginated export)

### PagedResult Standard (RH-OptimERP)

```csharp
// Shared across all microservices
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

// Controller usage
[HttpGet]
public async Task<ActionResult<PagedResult<CandidateDto>>> GetCandidates(
    [FromQuery] int page = 1,
    [FromQuery] int pageSize = 20,
    [FromQuery] string? search = null,
    [FromQuery] string? sort = "createdAt:desc")
{
    if (page < 1) return BadRequest(new { message = "Le numero de page doit etre >= 1" });
    if (pageSize < 1 || pageSize > 100) return BadRequest(new { message = "La taille de page doit etre entre 1 et 100" });

    var result = await _service.GetCandidatesAsync(page, pageSize, search, sort);
    return Ok(result);
}
```

### CosmosDB Pagination

```csharp
// Using OFFSET/LIMIT (small datasets)
var query = new QueryDefinition("SELECT * FROM c ORDER BY c.createdAt DESC OFFSET @offset LIMIT @limit")
    .WithParameter("@offset", (page - 1) * pageSize)
    .WithParameter("@limit", pageSize);

// Using continuation tokens (large datasets - more efficient)
public async Task<(List<T> Items, string? ContinuationToken)> GetPageAsync<T>(
    Container container, int pageSize, string? continuationToken = null)
{
    var options = new QueryRequestOptions { MaxItemCount = pageSize };
    var iterator = container.GetItemQueryIterator<T>(
        "SELECT * FROM c ORDER BY c._ts DESC",
        continuationToken,
        options);

    var response = await iterator.ReadNextAsync();
    return (response.ToList(), response.ContinuationToken);
}
```

### Node.js/TypeScript

```typescript
// Pagination middleware for Express
interface PaginationQuery {
  page?: number;
  pageSize?: number;
  sort?: string;
}

function parsePagination(query: PaginationQuery) {
  const page = Math.max(1, query.page || 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
  const sort = query.sort || 'createdAt:desc';

  return { page, pageSize, sort };
}

// Route
router.get('/api/candidates', async (req, res) => {
  const { page, pageSize, sort } = parsePagination(req.query);
  const result = await candidateService.getAll(page, pageSize, sort);

  res.json({
    items: result.items,
    totalCount: result.totalCount,
    page,
    pageSize,
    totalPages: Math.ceil(result.totalCount / pageSize),
    hasNext: page < Math.ceil(result.totalCount / pageSize),
    hasPrevious: page > 1
  });
});
```

## Testing

```csharp
[Fact]
public async Task GetCandidates_Pagination_ReturnsCorrectPage()
{
    // Arrange: Create 50 candidates
    for (int i = 0; i < 50; i++)
        await _service.CreateAsync(new Candidate { FirstName = $"Candidat{i}" });

    // Act
    var result = await _service.GetCandidatesAsync(page: 2, pageSize: 10);

    // Assert
    Assert.Equal(10, result.Items.Count);
    Assert.Equal(50, result.TotalCount);
    Assert.Equal(5, result.TotalPages);
    Assert.True(result.HasNext);
    Assert.True(result.HasPrevious);
}
```

## Related Skills

- `/implement-graphql` - GraphQL pagination with cursors
- `/optimize-database-queries` - Query performance for pagination
