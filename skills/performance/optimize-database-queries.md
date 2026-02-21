---
name: optimize-database-queries
description: Optimize database queries for performance (indexes, partition keys, N+1 prevention, RU optimization)
argument-hint: [database: cosmosdb|postgres|sqlserver|mongodb]
tags: [performance, database, queries, indexing, CosmosDB, optimization]
---

# Database Query Optimization Guide

Slow queries are the #1 cause of API latency. Optimize at the query level first, then consider caching.

---

## 1. CosmosDB Optimization

### Partition Key Design

```
GOOD partition keys (high cardinality, even distribution):
  /tenantId        → Multi-tenant apps
  /candidateId     → Candidate-centric queries
  /departmentId    → Department-scoped queries

BAD partition keys:
  /status          → Low cardinality (3-5 values)
  /createdDate     → Hot partitions on recent dates
  /country         → Skewed (80% might be "France")
```

### RU Optimization

```csharp
// ✗ BAD: Cross-partition query (high RU cost)
var query = container.GetItemLinqQueryable<Candidate>()
    .Where(c => c.Skills.Contains("C#"));  // Scans ALL partitions

// ✓ GOOD: Single-partition query
var query = container.GetItemLinqQueryable<Candidate>(
    requestOptions: new QueryRequestOptions { PartitionKey = new PartitionKey(tenantId) })
    .Where(c => c.Skills.Contains("C#"));

// ✓ GOOD: Point read (1 RU for 1KB doc)
var response = await container.ReadItemAsync<Candidate>(id, new PartitionKey(id));
// response.RequestCharge → 1 RU
```

### Index Policy

```json
{
  "indexingMode": "consistent",
  "includedPaths": [
    { "path": "/tenantId/?" },
    { "path": "/status/?" },
    { "path": "/skills/[]/?"},
    { "path": "/createdAt/?" }
  ],
  "excludedPaths": [
    { "path": "/description/?" },
    { "path": "/notes/?" },
    { "path": "/*" }
  ],
  "compositeIndexes": [
    [
      { "path": "/tenantId", "order": "ascending" },
      { "path": "/createdAt", "order": "descending" }
    ]
  ]
}
```

### Measure RU Consumption

```csharp
var response = await container.ReadItemAsync<Candidate>(id, new PartitionKey(id));
Console.WriteLine($"RU charge: {response.RequestCharge}");

// For queries
var iterator = container.GetItemQueryIterator<Candidate>(queryDef);
double totalRU = 0;
while (iterator.HasMoreResults)
{
    var batch = await iterator.ReadNextAsync();
    totalRU += batch.RequestCharge;
}
```

---

## 2. SQL Server / PostgreSQL

### Index Design

```sql
-- Covering index for frequent queries
CREATE INDEX IX_Candidate_Status_CreatedAt
ON Candidates (Status, CreatedAt DESC)
INCLUDE (FullName, Email);  -- Avoids key lookup

-- Filtered index (partial index in PostgreSQL)
CREATE INDEX IX_Active_Candidates
ON Candidates (CreatedAt DESC)
WHERE Status = 'Active';  -- Only indexes active records

-- PostgreSQL GIN index for array/JSONB
CREATE INDEX IX_Skills_GIN ON Candidates USING GIN (skills);
```

### Execution Plan Analysis

```sql
-- SQL Server
SET STATISTICS IO ON;
SET STATISTICS TIME ON;
SELECT * FROM Candidates WHERE Status = 'Active' ORDER BY CreatedAt DESC;

-- PostgreSQL
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM candidates WHERE status = 'active' ORDER BY created_at DESC;
```

| Warning Sign | Fix |
|-------------|-----|
| Table Scan / Seq Scan | Add index on filter columns |
| Key Lookup | Add INCLUDE columns to index |
| Sort operator (high cost) | Add ORDER BY columns to index |
| Nested Loop (many iterations) | Possible N+1 — batch the query |

---

## 3. N+1 Query Prevention

### Problem

```csharp
// ✗ N+1: 1 query for jobs + N queries for candidates per job
var jobs = await _jobRepo.GetAllAsync();
foreach (var job in jobs)
{
    job.Candidates = await _candidateRepo.GetByJobIdAsync(job.Id);  // N queries!
}
```

### Fix: Batch / Join

```csharp
// ✓ 2 queries total
var jobs = await _jobRepo.GetAllAsync();
var jobIds = jobs.Select(j => j.Id).ToList();
var candidates = await _candidateRepo.GetByJobIdsAsync(jobIds);  // 1 batch query
var grouped = candidates.GroupBy(c => c.JobId).ToDictionary(g => g.Key, g => g.ToList());
foreach (var job in jobs)
    job.Candidates = grouped.GetValueOrDefault(job.Id, []);
```

### Fix: EF Core Include

```csharp
// ✓ Single query with JOIN
var jobs = await _context.Jobs
    .Include(j => j.Candidates)
    .Where(j => j.Status == "Active")
    .ToListAsync();
```

---

## 4. Pagination

```csharp
// ✗ BAD: OFFSET pagination (slow for deep pages)
SELECT * FROM Candidates ORDER BY CreatedAt DESC OFFSET 10000 ROWS FETCH NEXT 20 ROWS ONLY;

// ✓ GOOD: Keyset/cursor pagination
SELECT * FROM Candidates
WHERE CreatedAt < @lastCreatedAt
ORDER BY CreatedAt DESC
FETCH FIRST 20 ROWS ONLY;
```

```csharp
// CosmosDB continuation token
var iterator = container.GetItemQueryIterator<Candidate>(queryDef,
    continuationToken: request.ContinuationToken,
    requestOptions: new QueryRequestOptions { MaxItemCount = 20 });
var page = await iterator.ReadNextAsync();
return new PagedResult<Candidate>
{
    Data = page.ToList(),
    ContinuationToken = page.ContinuationToken
};
```

---

## Performance Targets

| Operation | Target | Alert if |
|-----------|--------|----------|
| Point read (by ID) | <5ms / 1 RU | >10ms |
| Filtered list (1 partition) | <50ms / <10 RU | >100ms |
| Cross-partition query | <200ms / <50 RU | >500ms |
| Batch operation (100 items) | <500ms | >1s |
