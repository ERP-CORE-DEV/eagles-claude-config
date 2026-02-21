---
name: analyze-performance-bottleneck
description: Profile and identify performance bottlenecks using profiling tools, metrics, and analysis techniques
argument-hint: [type: cpu|memory|network|database] [stack: dotnet|node|python]
---

# Analyze Performance Bottleneck

Identify and diagnose performance issues using profiling and monitoring tools.

## Profiling Tools by Stack

### .NET
- **dotnet-trace**: Collect performance traces
- **dotnet-counters**: Real-time performance metrics
- **PerfView**: CPU and memory analysis
- **Visual Studio Profiler**: Integrated profiling
- **Application Insights**: Production monitoring

### Node.js
- **--inspect**: Chrome DevTools profiler
- **clinic.js**: Performance profiling suite
- **0x**: Flamegraph profiler
- **node --prof**: V8 profiler
- **New Relic/DataDog**: Production APM

### Python
- **cProfile**: Built-in profiler
- **py-spy**: Sampling profiler
- **memory_profiler**: Memory usage
- **line_profiler**: Line-by-line profiling
- **Pyroscope**: Continuous profiling

## CPU Profiling

### .NET Example
```bash
# Collect trace
dotnet-trace collect --process-id <PID> --profile cpu-sampling

# Analyze with PerfView
PerfView collect /AcceptE

ULA /MaxCollectSec:30

# Or use BenchmarkDotNet for micro-benchmarks
```

```csharp
[MemoryDiagnoser]
public class PerformanceBenchmark
{
    private List<int> _data;

    [GlobalSetup]
    public void Setup()
    {
        _data = Enumerable.Range(1, 10000).ToList();
    }

    [Benchmark]
    public int LinqSum() => _data.Sum();

    [Benchmark]
    public int ForLoopSum()
    {
        var sum = 0;
        for (int i = 0; i < _data.Count; i++)
            sum += _data[i];
        return sum;
    }
}
```

### Node.js Example
```bash
# Start with profiling
node --inspect index.js

# Or use clinic.js
clinic doctor -- node index.js
clinic flame -- node index.js

# Generate flamegraph
0x index.js
```

```javascript
// Manual performance measurement
console.time('operationName');
// Code to measure
console.timeEnd('operationName');

// Or use performance API
const { performance } = require('perf_hooks');

const start = performance.now();
// Code to measure
const end = performance.now();
console.log(`Execution time: ${end - start}ms`);
```

## Memory Profiling

### .NET Heap Analysis
```bash
# Take memory snapshot
dotnet-dump collect --process-id <PID>

# Analyze snapshot
dotnet-dump analyze dump_file

# Commands in analyzer
> dumpheap -stat  # Object statistics
> gcroot <address>  # Find roots
> sos eeheap -gc  # GC heap stats
```

```csharp
// Find memory leaks
public class MemoryAnalyzer
{
    public static void AnalyzeMemory()
    {
        GC.Collect();
        GC.WaitForPendingFinalizers();
        GC.Collect();

        var memoryBefore = GC.GetTotalMemory(false);

        // Run operation
        PerformOperation();

        GC.Collect();
        GC.WaitForPendingFinalizers();
        GC.Collect();

        var memoryAfter = GC.GetTotalMemory(false);
        var leaked = memoryAfter - memoryBefore;

        Console.WriteLine($"Memory leaked: {leaked / 1024} KB");
    }
}
```

### Node.js Memory Analysis
```bash
# Heap snapshot
node --inspect --heap-prof index.js

# Load snapshot in Chrome DevTools
# chrome://inspect -> Memory tab
```

```javascript
// Track memory usage
const formatMemoryUsage = (data) => `${Math.round(data / 1024 / 1024 * 100) / 100} MB`;

const memoryData = process.memoryUsage();

console.log({
  rss: formatMemoryUsage(memoryData.rss), // Total memory
  heapTotal: formatMemoryUsage(memoryData.heapTotal),
  heapUsed: formatMemoryUsage(memoryData.heapUsed),
  external: formatMemoryUsage(memoryData.external)
});
```

## Database Query Profiling

### SQL Server
```sql
-- Enable query statistics
SET STATISTICS TIME ON;
SET STATISTICS IO ON;

SELECT * FROM Users WHERE Email = 'test@example.com';

-- Actual execution plan
SET SHOWPLAN_ALL ON;
```

### PostgreSQL
```sql
-- Explain analyze
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT * FROM users WHERE email = 'test@example.com';

-- Slow query log
ALTER SYSTEM SET log_min_duration_statement = '1000'; -- Log queries > 1s
```

### Cosmos DB
```csharp
// Track RU consumption
var response = await container.ReadItemAsync<Product>(id, new PartitionKey(partitionKey));
Console.WriteLine($"RUs consumed: {response.RequestCharge}");

// Query metrics
var iterator = container.GetItemQueryIterator<Product>(query);
while (iterator.HasMoreResults)
{
    var response = await iterator.ReadNextAsync();
    Console.WriteLine($"Query RUs: {response.RequestCharge}");
}
```

## Network Performance

### Measure API Response Times
```csharp
public class PerformanceMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger _logger;

    public async Task InvokeAsync(HttpContext context)
    {
        var sw = Stopwatch.StartNew();

        await _next(context);

        sw.Stop();

        if (sw.ElapsedMilliseconds > 1000) // Slow request threshold
        {
            _logger.LogWarning(
                "Slow request: {Method} {Path} took {ElapsedMs}ms",
                context.Request.Method,
                context.Request.Path,
                sw.ElapsedMilliseconds
            );
        }
    }
}
```

## Common Bottlenecks & Solutions

### 1. N+1 Query Problem
```csharp
// ❌ BAD: N+1 queries
var users = await _context.Users.ToListAsync();
foreach (var user in users)
{
    var orders = await _context.Orders.Where(o => o.UserId == user.Id).ToListAsync();
    // Process orders
}

// ✅ GOOD: Single query with Include
var users = await _context.Users
    .Include(u => u.Orders)
    .ToListAsync();
```

### 2. Blocking I/O
```csharp
// ❌ BAD: Synchronous I/O
var result = File.ReadAllText("file.txt");

// ✅ GOOD: Asynchronous I/O
var result = await File.ReadAllTextAsync("file.txt");
```

### 3. Large Object Allocation
```csharp
// ❌ BAD: Creates many intermediate strings
string result = "";
for (int i = 0; i < 10000; i++)
{
    result += i.ToString(); // Allocates new string each time
}

// ✅ GOOD: StringBuilder
var sb = new StringBuilder();
for (int i = 0; i < 10000; i++)
{
    sb.Append(i);
}
var result = sb.ToString();
```

### 4. Missing Indexes
```sql
-- Check for missing indexes
SELECT
    migs.avg_user_impact * (migs.user_seeks + migs.user_scans) AS impact,
    mid.statement AS table_name,
    mid.equality_columns,
    mid.inequality_columns,
    mid.included_columns
FROM sys.dm_db_missing_index_details AS mid
INNER JOIN sys.dm_db_missing_index_groups AS mig
    ON mig.index_handle = mid.index_handle
INNER JOIN sys.dm_db_missing_index_group_stats AS migs
    ON mig.index_group_handle = migs.group_handle
ORDER BY impact DESC;
```

### 5. Memory Leaks
```csharp
// ❌ BAD: Event handler not unsubscribed (memory leak)
public class Subscriber
{
    public Subscriber(Publisher publisher)
    {
        publisher.Event += OnEvent; // Leak if not unsubscribed
    }

    private void OnEvent(object sender, EventArgs e) { }
}

// ✅ GOOD: Unsubscribe in Dispose
public class Subscriber : IDisposable
{
    private readonly Publisher _publisher;

    public Subscriber(Publisher publisher)
    {
        _publisher = publisher;
        _publisher.Event += OnEvent;
    }

    public void Dispose()
    {
        _publisher.Event -= OnEvent;
    }

    private void OnEvent(object sender, EventArgs e) { }
}
```

## Performance Metrics to Track

### Application Metrics
- **Response time**: p50, p95, p99
- **Throughput**: Requests per second
- **Error rate**: 4xx, 5xx responses
- **CPU usage**: Average, peak
- **Memory usage**: Heap, GC frequency
- **Thread count**: Active, blocked

### Database Metrics
- **Query duration**: Slow queries (> 1s)
- **Connection pool**: Active, waiting
- **Index usage**: Scans vs seeks
- **Lock waits**: Deadlocks, blocking
- **RU consumption**: Cosmos DB

### Infrastructure Metrics
- **Network latency**: RTT, bandwidth
- **Disk I/O**: IOPS, throughput
- **Cache hit rate**: Redis, CDN
- **Queue depth**: Message backlog

## Analysis Workflow

1. **Reproduce**: Reproduce performance issue in controlled environment
2. **Measure**: Collect baseline metrics and traces
3. **Profile**: Use profiling tools to identify hotspots
4. **Hypothesize**: Form hypothesis about root cause
5. **Fix**: Implement optimization
6. **Verify**: Measure improvement with before/after comparison
7. **Monitor**: Set up alerts for regression

## Tools Comparison

| Tool | Type | Platform | Cost | Use Case |
|------|------|----------|------|----------|
| dotnet-trace | Profiler | .NET | Free | CPU profiling |
| PerfView | Profiler | .NET | Free | Advanced analysis |
| Application Insights | APM | Azure | Paid | Production monitoring |
| Chrome DevTools | Profiler | Node.js/Browser | Free | Frontend/Node profiling |
| clinic.js | Profiler | Node.js | Free | Comprehensive analysis |
| New Relic | APM | All | Paid | Full-stack monitoring |
| DataDog | APM | All | Paid | Infrastructure + APM |
| Sentry | Error tracking | All | Freemium | Error + performance |

## Reporting Template

```markdown
## Performance Analysis Report

### Issue Description
- Symptom: API endpoint `/api/products` taking 5+ seconds
- Impact: 20% of users affected, increased bounce rate
- Occurrence: Production, during peak hours (2-4 PM)

### Analysis
- **Tool Used**: Application Insights
- **Root Cause**: N+1 query loading product categories
- **Evidence**: 500+ database queries per request

### Fix Applied
- Implemented eager loading with `.Include()`
- Added caching for product categories

### Results
- **Before**: 5000ms average response time
- **After**: 150ms average response time
- **Improvement**: 97% reduction
- **RU Savings**: 95% reduction in Cosmos DB RUs

### Recommendations
- Add database query monitoring
- Set alert for response time > 1s
- Review all endpoints for N+1 patterns
```
