---
name: add-caching
description: Implement caching strategies to improve performance (in-memory, Redis, distributed)
argument-hint: [type: memory|redis|distributed] [pattern: cache-aside|read-through|write-through]
---

# Add Caching

Implement caching to reduce database load and improve response times.

## Caching Strategies

### Cache-Aside (Lazy Loading)
- Check cache first
- If miss, load from database
- Store in cache
- Best for read-heavy workloads

### Read-Through
- Cache automatically loads from database on miss
- Transparent to application

### Write-Through
- Write to cache and database simultaneously
- Strong consistency
- Higher write latency

### Write-Behind
- Write to cache immediately
- Async write to database
- Risk of data loss

## Cache Types

### In-Memory Cache
- Fastest (no network)
- Limited to single server
- Use for: Session data, user preferences

### Redis (Distributed)
- Shared across servers
- Persistent storage option
- Use for: API responses, user sessions, rate limiting

### CDN Cache
- Edge caching for static assets
- Use for: Images, CSS, JS, API responses (public)

## .NET Implementation

### In-Memory Caching
```csharp
// Program.cs
builder.Services.AddMemoryCache();

// Service
public class ProductService : IProductService
{
    private readonly IMemoryCache _cache;
    private readonly IProductRepository _repo;

    public async Task<Product> GetProductAsync(Guid id)
    {
        var cacheKey = $"product:{id}";

        if (_cache.TryGetValue(cacheKey, out Product cachedProduct))
        {
            return cachedProduct;
        }

        var product = await _repo.GetByIdAsync(id);

        var cacheOptions = new MemoryCacheEntryOptions()
            .SetAbsoluteExpiration(TimeSpan.FromMinutes(5))
            .SetSlidingExpiration(TimeSpan.FromMinutes(2));

        _cache.Set(cacheKey, product, cacheOptions);

        return product;
    }
}
```

### Redis Caching
```csharp
// Program.cs
builder.Services.AddStackExchangeRedisCache(options =>
{
    options.Configuration = builder.Configuration["Redis:ConnectionString"];
    options.InstanceName = "RH-OptimERP:";
});

// Service
public class ProductService : IProductService
{
    private readonly IDistributedCache _cache;
    private readonly IProductRepository _repo;

    public async Task<Product> GetProductAsync(Guid id)
    {
        var cacheKey = $"product:{id}";

        var cachedData = await _cache.GetStringAsync(cacheKey);
        if (cachedData != null)
        {
            return JsonSerializer.Deserialize<Product>(cachedData);
        }

        var product = await _repo.GetByIdAsync(id);

        var cacheOptions = new DistributedCacheEntryOptions()
            .SetAbsoluteExpiration(TimeSpan.FromMinutes(5))
            .SetSlidingExpiration(TimeSpan.FromMinutes(2));

        await _cache.SetStringAsync(
            cacheKey,
            JsonSerializer.Serialize(product),
            cacheOptions);

        return product;
    }

    public async Task InvalidateCacheAsync(Guid id)
    {
        await _cache.RemoveAsync($"product:{id}");
    }
}
```

## Node.js/Redis Implementation

```javascript
const redis = require('redis');
const client = redis.createClient({
  url: process.env.REDIS_URL
});

await client.connect();

// Cache-aside pattern
async function getProduct(id) {
  const cacheKey = `product:${id}`;

  // Check cache
  const cached = await client.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // Cache miss - load from database
  const product = await db.products.findById(id);

  // Store in cache (TTL: 5 minutes)
  await client.setEx(cacheKey, 300, JSON.stringify(product));

  return product;
}

// Invalidate cache on update
async function updateProduct(id, updates) {
  const product = await db.products.updateOne({ _id: id }, updates);

  // Invalidate cache
  await client.del(`product:${id}`);

  return product;
}
```

## Python/Flask Implementation

```python
from flask_caching import Cache
import redis

# In-memory cache
cache = Cache(app, config={'CACHE_TYPE': 'simple'})

@cache.memoize(timeout=300)
def get_product(product_id):
    return db.products.find_one({'_id': product_id})

# Redis cache
redis_client = redis.Redis(host='localhost', port=6379, decode_responses=True)

def get_product_redis(product_id):
    cache_key = f'product:{product_id}'

    # Check cache
    cached = redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    # Load from database
    product = db.products.find_one({'_id': product_id})

    # Store in cache (5 minutes)
    redis_client.setex(cache_key, 300, json.dumps(product))

    return product
```

## Cache Invalidation Strategies

### Time-Based (TTL)
```csharp
// Absolute expiration: Cache expires after 10 minutes
.SetAbsoluteExpiration(TimeSpan.FromMinutes(10))

// Sliding expiration: Reset timer on each access
.SetSlidingExpiration(TimeSpan.FromMinutes(5))
```

### Event-Based
```csharp
// Invalidate on entity update
public async Task UpdateProductAsync(Guid id, UpdateProductDto dto)
{
    var product = await _repo.UpdateAsync(id, dto);

    // Invalidate cache
    await _cache.RemoveAsync($"product:{id}");
    await _cache.RemoveAsync("product:list"); // List cache

    return product;
}
```

### Tag-Based Invalidation
```csharp
// Redis tag-based
public async Task InvalidateProductCachesAsync()
{
    var server = _redis.GetServer(_redis.GetEndPoints().First());
    var keys = server.Keys(pattern: "product:*");

    foreach (var key in keys)
    {
        await _redis.KeyDeleteAsync(key);
    }
}
```

## Common Patterns

### Cache List Results
```csharp
public async Task<PagedResult<Product>> GetProductsAsync(int page, int pageSize)
{
    var cacheKey = $"products:list:{page}:{pageSize}";

    if (_cache.TryGetValue(cacheKey, out PagedResult<Product> cached))
    {
        return cached;
    }

    var result = await _repo.GetPagedAsync(page, pageSize);
    _cache.Set(cacheKey, result, TimeSpan.FromMinutes(2));

    return result;
}
```

### Cache with Cache Keys
```csharp
// Use Redis Sets to track cache keys for invalidation
await _redis.SetAddAsync("cache:products:keys", $"product:{id}");

// Invalidate all product caches
var keys = await _redis.SetMembersAsync("cache:products:keys");
foreach (var key in keys)
{
    await _redis.KeyDeleteAsync(key);
}
await _redis.KeyDeleteAsync("cache:products:keys");
```

## Best Practices

1. **Set appropriate TTL** (balance freshness vs performance)
2. **Cache immutable data longer** (lookups, categories)
3. **Invalidate on updates** (don't serve stale data)
4. **Use cache keys with namespaces** (`product:{id}`, `user:{id}`)
5. **Monitor cache hit rate** (aim for >80%)
6. **Implement cache warming** for critical data
7. **Handle cache failures gracefully** (fallback to database)
8. **Don't cache sensitive data** without encryption
9. **Use compression** for large objects
10. **Consider cache stampede protection** (distributed locks)

## Monitoring

```csharp
// Track cache metrics
public class CachedProductService : IProductService
{
    private int _hits = 0;
    private int _misses = 0;

    public async Task<Product> GetProductAsync(Guid id)
    {
        var cached = await _cache.GetAsync(id);
        if (cached != null)
        {
            Interlocked.Increment(ref _hits);
            return cached;
        }

        Interlocked.Increment(ref _misses);
        // Load from database
    }

    public double GetHitRate() => _hits / (double)(_hits + _misses);
}
```
