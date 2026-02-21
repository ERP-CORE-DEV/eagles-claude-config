---
name: implement-caching-strategy
description: Implement multi-layer caching with Redis, in-memory, and CDN
category: performance
tags: [caching, redis, in-memory, cdn, performance, distributed-cache]
stacks: [dotnet, nodejs, python]
---

# Implement Multi-Layer Caching Strategy

A comprehensive guide for implementing production-grade caching across .NET 8, Node.js, and Python stacks, covering in-memory, distributed (Redis), and CDN layers with proper invalidation, TTL management, and stampede prevention.

## When to Use

- **High read-to-write ratio endpoints** (e.g., product catalogs, user profiles, reference data)
- **Expensive computations or queries** that produce deterministic results for the same inputs
- **Repeated external API calls** where upstream data changes infrequently
- **Session and authentication token storage** in distributed environments
- **Database offloading** when query latency exceeds SLA thresholds (e.g., >50ms p95)
- **Multi-instance deployments** where local-only caching causes inconsistency

**Do NOT use caching when:**
- Data must always be real-time consistent (financial transactions, inventory counts during checkout)
- The dataset is so small that caching adds complexity without measurable benefit
- Write frequency exceeds read frequency for the same keys

---

## Cache Topology: Three-Layer Architecture

```
Request --> [L1: In-Memory] --> [L2: Redis / Distributed] --> [L3: CDN / Edge] --> Origin
```

| Layer | Latency | Scope | Capacity | Use Case |
|-------|---------|-------|----------|----------|
| L1 In-Memory | <1ms | Per-process | Limited (MB) | Hot data, computed values |
| L2 Redis | 1-5ms | Cluster-wide | Large (GB) | Shared state, sessions |
| L3 CDN | 10-50ms | Global edge | Very large | Static assets, API responses |

---

## Implementation: .NET 8

### Package Dependencies

```xml
<PackageReference Include="Microsoft.Extensions.Caching.Memory" Version="8.0.*" />
<PackageReference Include="Microsoft.Extensions.Caching.StackExchangeRedis" Version="8.0.*" />
```

### Service Registration (Program.cs)

```csharp
// L1: In-Memory Cache
builder.Services.AddMemoryCache(options =>
{
    options.SizeLimit = 1024; // Max number of entries (requires SetSize on each entry)
});

// L2: Redis Distributed Cache
builder.Services.AddStackExchangeRedisCache(options =>
{
    options.Configuration = builder.Configuration.GetConnectionString("Redis");
    options.InstanceName = "MyApp:";
});
```

### Multi-Layer Cache Service

```csharp
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Caching.Distributed;
using System.Collections.Concurrent;
using System.Text.Json;

namespace MyApp.Services.Caching;

public interface ICacheService
{
    Task<T?> GetOrSetAsync<T>(string key, Func<Task<T>> factory,
        TimeSpan? l1Ttl = null, TimeSpan? l2Ttl = null);
    Task InvalidateAsync(string key);
    Task InvalidateByPrefixAsync(string prefix);
}

public class MultiLayerCacheService : ICacheService
{
    private readonly IMemoryCache _memoryCache;
    private readonly IDistributedCache _distributedCache;
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> _keyLocks = new();

    public MultiLayerCacheService(IMemoryCache memoryCache, IDistributedCache distributedCache)
    {
        _memoryCache = memoryCache;
        _distributedCache = distributedCache;
    }

    public async Task<T?> GetOrSetAsync<T>(string key, Func<Task<T>> factory,
        TimeSpan? l1Ttl = null, TimeSpan? l2Ttl = null)
    {
        l1Ttl ??= TimeSpan.FromMinutes(5);
        l2Ttl ??= TimeSpan.FromMinutes(30);

        // L1: Check in-memory first
        if (_memoryCache.TryGetValue(key, out T? cached))
            return cached;

        // L2: Check Redis
        var redisValue = await _distributedCache.GetStringAsync(key);
        if (redisValue is not null)
        {
            var deserialized = JsonSerializer.Deserialize<T>(redisValue);
            _memoryCache.Set(key, deserialized, new MemoryCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = l1Ttl,
                Size = 1
            });
            return deserialized;
        }

        // Cache miss: acquire per-key lock to prevent stampede
        var keyLock = _keyLocks.GetOrAdd(key, _ => new SemaphoreSlim(1, 1));
        await keyLock.WaitAsync();
        try
        {
            // Double-check after acquiring lock
            if (_memoryCache.TryGetValue(key, out cached))
                return cached;

            // Fetch from origin
            var value = await factory();

            // Populate L2 (Redis) first
            await _distributedCache.SetStringAsync(key,
                JsonSerializer.Serialize(value),
                new DistributedCacheEntryOptions
                {
                    AbsoluteExpirationRelativeToNow = l2Ttl
                });

            // Populate L1 (in-memory)
            _memoryCache.Set(key, value, new MemoryCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = l1Ttl,
                Size = 1
            });

            return value;
        }
        finally
        {
            keyLock.Release();
        }
    }

    public async Task InvalidateAsync(string key)
    {
        _memoryCache.Remove(key);
        await _distributedCache.RemoveAsync(key);
    }

    public async Task InvalidateByPrefixAsync(string prefix)
    {
        // Note: Redis SCAN-based prefix deletion requires StackExchange.Redis
        // IDistributedCache does not support prefix deletion natively.
        // Use IConnectionMultiplexer directly for production prefix invalidation.
        _memoryCache.Remove(prefix); // Limited; see Best Practices below
    }
}
```

### Usage in a Controller

```csharp
[HttpGet("candidates/{id}")]
public async Task<IActionResult> GetCandidate(string id)
{
    var candidate = await _cacheService.GetOrSetAsync(
        $"candidate:{id}",
        () => _repository.GetByIdAsync(id),
        l1Ttl: TimeSpan.FromMinutes(2),
        l2Ttl: TimeSpan.FromMinutes(15)
    );

    return candidate is null ? NotFound() : Ok(candidate);
}
```

---

## Implementation: Node.js

### Package Dependencies

```bash
npm install ioredis node-cache
```

### Multi-Layer Cache Module

```typescript
import NodeCache from "node-cache";
import Redis from "ioredis";

const localCache = new NodeCache({
  stdTTL: 300,        // Default 5 min L1 TTL
  checkperiod: 60,    // Cleanup interval
  maxKeys: 5000,
});

const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD,
  keyPrefix: "myapp:",
  retryStrategy: (times: number) => Math.min(times * 200, 5000),
});

const keyLocks = new Map<string, Promise<unknown>>();

export async function getOrSet<T>(
  key: string,
  factory: () => Promise<T>,
  l1TtlSec = 300,
  l2TtlSec = 1800
): Promise<T> {
  // L1: local in-memory
  const local = localCache.get<T>(key);
  if (local !== undefined) return local;

  // L2: Redis
  const redisVal = await redis.get(key);
  if (redisVal !== null) {
    const parsed = JSON.parse(redisVal) as T;
    localCache.set(key, parsed, l1TtlSec);
    return parsed;
  }

  // Stampede prevention: coalesce concurrent calls for the same key
  if (keyLocks.has(key)) {
    await keyLocks.get(key);
    const retryLocal = localCache.get<T>(key);
    if (retryLocal !== undefined) return retryLocal;
  }

  const promise = factory();
  keyLocks.set(key, promise);

  try {
    const value = await promise;
    await redis.setex(key, l2TtlSec, JSON.stringify(value));
    localCache.set(key, value, l1TtlSec);
    return value;
  } finally {
    keyLocks.delete(key);
  }
}

export async function invalidate(key: string): Promise<void> {
  localCache.del(key);
  await redis.del(key);
}

export async function invalidateByPrefix(prefix: string): Promise<void> {
  // Flush matching local keys
  const localKeys = localCache.keys().filter((k) => k.startsWith(prefix));
  localCache.del(localKeys);

  // Redis SCAN-based deletion (safe for production, no KEYS command)
  let cursor = "0";
  do {
    const [nextCursor, keys] = await redis.scan(
      cursor, "MATCH", `myapp:${prefix}*`, "COUNT", 100
    );
    cursor = nextCursor;
    if (keys.length > 0) {
      const pipeline = redis.pipeline();
      keys.forEach((k) => pipeline.del(k));
      await pipeline.exec();
    }
  } while (cursor !== "0");
}
```

---

## Implementation: Python (Flask)

### Package Dependencies

```bash
pip install Flask-Caching redis
```

### Multi-Layer Cache Module

```python
import json
import threading
from typing import TypeVar, Callable, Optional

import redis
from flask_caching import Cache

T = TypeVar("T")

# L1: In-process cache (SimpleCache or uwsgi cache)
local_cache = Cache(config={
    "CACHE_TYPE": "SimpleCache",
    "CACHE_DEFAULT_TIMEOUT": 300,
    "CACHE_THRESHOLD": 5000,
})

# L2: Redis
redis_client = redis.Redis(
    host="localhost",
    port=6379,
    db=0,
    decode_responses=True,
    socket_connect_timeout=5,
    retry_on_timeout=True,
)

_key_locks: dict[str, threading.Lock] = {}
_locks_lock = threading.Lock()


def _get_key_lock(key: str) -> threading.Lock:
    with _locks_lock:
        if key not in _key_locks:
            _key_locks[key] = threading.Lock()
        return _key_locks[key]


def get_or_set(
    key: str,
    factory: Callable[[], T],
    l1_ttl: int = 300,
    l2_ttl: int = 1800,
) -> Optional[T]:
    """Multi-layer cache-aside with stampede prevention."""

    # L1
    local_val = local_cache.get(key)
    if local_val is not None:
        return local_val

    # L2
    redis_val = redis_client.get(f"myapp:{key}")
    if redis_val is not None:
        parsed = json.loads(redis_val)
        local_cache.set(key, parsed, timeout=l1_ttl)
        return parsed

    # Stampede prevention via per-key lock
    lock = _get_key_lock(key)
    with lock:
        # Double-check
        local_val = local_cache.get(key)
        if local_val is not None:
            return local_val

        value = factory()
        redis_client.setex(f"myapp:{key}", l2_ttl, json.dumps(value))
        local_cache.set(key, value, timeout=l1_ttl)
        return value


def invalidate(key: str) -> None:
    local_cache.delete(key)
    redis_client.delete(f"myapp:{key}")


def invalidate_by_prefix(prefix: str) -> None:
    local_cache.clear()  # SimpleCache has no prefix deletion; clear all
    cursor = 0
    while True:
        cursor, keys = redis_client.scan(cursor, match=f"myapp:{prefix}*", count=100)
        if keys:
            redis_client.delete(*keys)
        if cursor == 0:
            break
```

---

## Cache Invalidation Strategies

### 1. Cache-Aside (Lazy Loading)
Read path populates cache on miss. Write path invalidates the cache key; next read re-populates. This is the pattern used in the implementations above.

- **Pros**: Simple, only caches data that is actually read
- **Cons**: First request after invalidation is slow (cache miss)

### 2. Write-Through
Every write updates both the data store and the cache atomically.

```csharp
public async Task UpdateCandidateAsync(Candidate candidate)
{
    await _repository.UpdateAsync(candidate);
    // Immediately refresh cache
    var key = $"candidate:{candidate.Id}";
    await _distributedCache.SetStringAsync(key,
        JsonSerializer.Serialize(candidate),
        new DistributedCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30)
        });
    _memoryCache.Set(key, candidate, TimeSpan.FromMinutes(5));
}
```

- **Pros**: Cache is always fresh after writes
- **Cons**: Higher write latency; caches data that may never be read

### 3. Write-Behind (Write-Back)
Writes go to cache first, then asynchronously flush to the database. Useful for high-write scenarios but requires careful durability handling. Typically implemented via a background worker or message queue.

### 4. Event-Driven Invalidation
Publish a domain event (e.g., via Azure Service Bus, RabbitMQ, or Redis Pub/Sub) on mutation. All service instances subscribe and invalidate their local L1 cache.

```csharp
// Publisher (after DB write)
await _messageBus.PublishAsync(new CacheInvalidationEvent("candidate", candidateId));

// Subscriber (each instance)
public Task HandleAsync(CacheInvalidationEvent evt)
{
    _memoryCache.Remove($"{evt.EntityType}:{evt.EntityId}");
    return Task.CompletedTask;
}
```

---

## TTL Configuration Guidelines

| Data Type | L1 (In-Memory) | L2 (Redis) | Rationale |
|-----------|-----------------|-------------|-----------|
| Reference/static data | 30 min | 24 hours | Rarely changes |
| User profiles | 5 min | 30 min | Moderate change frequency |
| Search results | 2 min | 10 min | Frequent updates |
| Session tokens | N/A | Match token expiry | Security requirement |
| Real-time counters | 10 sec | 60 sec | Near-real-time needs |

**Rule of thumb**: L1 TTL should be 1/6 to 1/3 of L2 TTL. This limits staleness while preserving the performance benefit of in-memory access.

---

## Cache Stampede Prevention

A **cache stampede** occurs when many concurrent requests hit a cache miss simultaneously and all call the origin, overloading the database.

### Techniques

1. **Mutex/Lock (implemented above)**: Only one caller fetches from origin; others wait.
2. **Probabilistic Early Expiration**: Randomly refresh before TTL expires. Each request checks `currentTime + (random * beta * computeTime) >= expiryTime` and re-fetches if true.
3. **Stale-While-Revalidate**: Serve stale data while one background thread refreshes. Requires storing both value and expiry metadata.

```csharp
// Probabilistic early refresh example
var entry = _memoryCache.Get<CacheEntry<T>>(key);
if (entry is not null)
{
    var delta = entry.ComputeTimeMs * Math.Log(Random.Shared.NextDouble()) * -1;
    if (DateTime.UtcNow.AddMilliseconds(delta) < entry.ExpiresAt)
        return entry.Value; // Serve cached
    // Else: fall through to refresh
}
```

---

## CDN Layer (L3) Configuration

For API responses that can tolerate staleness, set HTTP cache headers:

```csharp
[HttpGet("public/job-listings")]
[ResponseCache(Duration = 600, Location = ResponseCacheLocation.Any,
    VaryByQueryKeys = new[] { "page", "category" })]
public async Task<IActionResult> GetJobListings(
    [FromQuery] int page, [FromQuery] string? category)
{
    // CDN and browser will cache this response for 10 minutes
    var listings = await _service.GetListingsAsync(page, category);
    return Ok(listings);
}
```

In `Program.cs`:
```csharp
builder.Services.AddResponseCaching();
app.UseResponseCaching();
```

---

## Best Practices

1. **Use structured key naming**: `{entity}:{id}:{variant}` (e.g., `candidate:abc123:summary`). This enables prefix-based invalidation and makes debugging straightforward.
2. **Always set a TTL**: Never cache indefinitely. Even "static" data should have a 24-hour ceiling to prevent ghost entries.
3. **Monitor hit rates**: Track `cache.hits` / `cache.misses` metrics. A hit rate below 80% suggests poor key design or too-short TTLs.
4. **Serialize with versioning**: Include a schema version in the cache key or value wrapper so deployments with changed DTOs do not deserialize corrupt data.
5. **Size-bound L1 caches**: Always configure `SizeLimit` (.NET) or `maxKeys` (node-cache) to prevent unbounded memory growth.
6. **Use pipeline/batch operations for Redis**: When fetching or invalidating multiple keys, use `MGET`, `PIPELINE`, or Lua scripts to reduce round trips.
7. **Health check Redis connectivity**: Register a health check endpoint that verifies Redis is reachable; degrade gracefully to origin-only if Redis is down.
8. **Compress large values**: For payloads >1KB in Redis, use GZip or Brotli compression to reduce memory and network costs.
9. **Avoid caching nulls without intent**: If a cache miss returns null from the origin, decide explicitly whether to cache it (to prevent repeated DB lookups for nonexistent entities) or skip caching (to allow the entity to appear soon).
10. **Use sliding expiration sparingly**: Sliding TTLs keep hot keys alive indefinitely, which can mask staleness. Prefer absolute expiration with explicit refresh.

## Common Pitfalls

1. **Cache key collisions**: Using overly generic keys (e.g., `"data"`) leads to cross-tenant or cross-entity data leaks. Always include the entity type and ID.
2. **Forgetting to invalidate on writes**: Updating the database without clearing the cache causes stale reads. Audit every write path to ensure invalidation is wired.
3. **Thundering herd after deployment**: A new deployment with cold caches causes all requests to hit the origin simultaneously. Mitigate with cache warming scripts or staggered rollouts.
4. **Serialization mismatches**: Changing a DTO shape without versioning the cache key causes deserialization failures. Always version your cache keys on schema changes.
5. **Redis maxmemory eviction surprises**: If Redis evicts keys under memory pressure using `allkeys-lru`, critical session data may be lost. Use separate Redis instances or databases for sessions vs. general cache.
6. **Logging cache values**: Accidentally logging cached PII (names, emails) violates GDPR/CNIL. Log only cache keys and hit/miss status, never values.
7. **Testing only the happy path**: Unit tests must cover cache miss, cache hit, concurrent access, Redis unavailability, and TTL expiration scenarios.
8. **Ignoring network partitions**: When Redis is unreachable, the application must fall back to direct origin access, not throw unhandled exceptions. Wrap all Redis calls in try/catch with fallback logic.
