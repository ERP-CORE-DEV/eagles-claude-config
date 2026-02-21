---
name: optimize-queries
description: Analyze and optimize slow database queries with indexing and query rewriting
argument-hint: [database-type: cosmos|postgres|mongodb|sqlserver|mysql]
---

# Optimize Database Queries

Identify and fix slow queries through profiling, indexing, and query optimization.

## When to Use
- Query execution time exceeds SLA
- High database CPU/memory usage
- N+1 query patterns detected
- Missing or unused indexes
- Full table scans in execution plans

## What This Skill Does
1. Analyzes query execution plans
2. Identifies missing indexes
3. Detects N+1 query patterns
4. Rewrites inefficient queries
5. Adds covering indexes
6. Implements query result caching
7. Suggests database-specific optimizations

## Optimization Techniques

### SQL Databases
- Add indexes on WHERE/JOIN columns
- Use covering indexes for SELECT columns
- Avoid SELECT * (specify columns)
- Use INNER JOIN instead of subqueries
- Paginate large result sets
- Use EXISTS instead of IN for large lists

### NoSQL (CosmosDB/MongoDB)
- Create composite indexes for multi-field queries
- Use partition key in queries (avoid cross-partition)
- Limit result sets with MaxItemCount/limit
- Project only needed fields
- Use aggregation pipelines efficiently

## Example Usage
```
User: This query is taking 5 seconds: SELECT * FROM Orders WHERE CustomerId = @id AND OrderDate > @date
Assistant: [Uses optimize-queries skill]

Analysis:
- Full table scan detected (no index)
- SELECT * retrieves unnecessary columns
- Missing index on (CustomerId, OrderDate)

Optimized:
CREATE INDEX IX_Orders_CustomerId_OrderDate
ON Orders(CustomerId, OrderDate)
INCLUDE (OrderNumber, TotalAmount);

SELECT OrderId, OrderNumber, TotalAmount, OrderDate
FROM Orders WITH (INDEX(IX_Orders_CustomerId_OrderDate))
WHERE CustomerId = @id AND OrderDate > @date;

Result: Query time reduced from 5s to 15ms
```

## Performance Metrics Provided
- Execution time before/after
- Logical reads reduced
- Index recommendations
- Estimated cost reduction


## French HR Context

CosmosDB query optimization for French HR systems:
- Candidate search across 100K+ profiles
- Paie calculations with cross-container joins
- DSN report generation (monthly batch)

### CosmosDB Query Optimization

```csharp
// BAD: Cross-partition query (expensive)
var query = "SELECT * FROM c WHERE c.department = 'RH'";

// GOOD: Partition-aware query
var query = new QueryDefinition("SELECT * FROM c WHERE c.partitionKey = @pk AND c.department = @dept")
    .WithParameter("@pk", companyId)
    .WithParameter("@dept", "RH");

// GOOD: Project only needed fields (reduces RU cost)
var query = new QueryDefinition(
    "SELECT c.id, c.firstName, c.lastName, c.email FROM c WHERE c.contractType = @type")
    .WithParameter("@type", "CDI");

// GOOD: Use composite index for sorting + filtering
// In CosmosDB indexing policy:
// "compositeIndexes": [
//   [
//     { "path": "/contractType", "order": "ascending" },
//     { "path": "/createdAt", "order": "descending" }
//   ]
// ]

// Monitor RU consumption
var response = await container.GetItemQueryIterator<Candidate>(query).ReadNextAsync();
_logger.LogInformation("Query cost: {RU} RUs", response.RequestCharge);
```

### Node.js/TypeScript

```typescript
// Paginated query with continuation token
async function getPagedCandidates(pageSize: number, continuationToken?: string) {
  const querySpec = {
    query: 'SELECT * FROM c ORDER BY c.createdAt DESC',
    parameters: []
  };

  const options = {
    maxItemCount: pageSize,
    continuationToken
  };

  const { resources, continuationToken: nextToken, requestCharge } =
    await container.items.query(querySpec, options).fetchNext();

  console.log(`RU cost: ${requestCharge}`);
  return { items: resources, nextToken };
}
```

## Testing

```csharp
[Fact]
public async Task OptimizedQuery_UsesLessRUs()
{
    // Arrange: Create test data
    for (int i = 0; i < 100; i++)
        await _container.CreateItemAsync(new Candidate { Id = $"c{i}", ContractType = "CDI" });

    // Act: Run optimized vs unoptimized query
    var optimized = await RunQuery("SELECT c.id, c.firstName FROM c WHERE c.contractType = 'CDI'");
    var unoptimized = await RunQuery("SELECT * FROM c WHERE c.contractType = 'CDI'");

    // Assert: Optimized uses fewer RUs
    Assert.True(optimized.RequestCharge < unoptimized.RequestCharge);
}
```

## Related Skills

- `/optimize-database-queries` - Comprehensive query optimization
- `/implement-change-tracking` - Track query performance changes


## Note: Contexte RH Francais

Pour les systemes RH francais, l'optimisation des requetes est critique lors de la generation DSN (Declaration Sociale Nominative) mensuelle. Cette operation necessite le traitement de tous les employes et leurs contrats de travail. Utiliser des requetes paginees avec tokens de continuation plutot que OFFSET/LIMIT pour les exports CNIL et les rapports de paie volumineux.
