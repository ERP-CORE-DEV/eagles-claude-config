---
name: implement-batch-processing
description: Implement batch processing for large-scale data operations (matching, ETL, reports)
argument-hint: [stack: dotnet|node|python] [tool: hangfire|bull|celery]
tags: [data-processing, batch, background-jobs, Hangfire, Bull, Celery, scheduling]
---

# Batch Processing Guide

Batch processing handles large datasets in chunks. Essential for: bulk matching, report generation, data migrations, GDPR anonymization.

---

## 1. .NET 8 (Hangfire)

### Setup

```bash
dotnet add package Hangfire.AspNetCore
dotnet add package Hangfire.SqlServer  # or Hangfire.Mongo, Hangfire.PostgreSql
```

```csharp
builder.Services.AddHangfire(config => config
    .SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
    .UseSimpleAssemblyNameTypeSerializer()
    .UseRecommendedSerializerSettings()
    .UseSqlServerStorage(connectionString));
builder.Services.AddHangfireServer(options =>
{
    options.Queues = ["critical", "default", "low"];
    options.WorkerCount = Environment.ProcessorCount * 2;
});

app.UseHangfireDashboard("/hangfire", new DashboardOptions
{
    Authorization = [new HangfireAuthFilter()]  // Secure the dashboard
});
```

### Batch Matching Job

```csharp
public class BatchMatchingJob(
    ICandidateRepository candidateRepo,
    IJobOfferRepository jobRepo,
    IMatchingService matching,
    ILogger<BatchMatchingJob> logger)
{
    public async Task ExecuteAsync(string jobOfferId, IJobCancellationToken ct)
    {
        var job = await jobRepo.GetByIdAsync(jobOfferId);
        var candidates = await candidateRepo.GetAllActiveAsync();
        var total = candidates.Count;
        var processed = 0;
        var batchSize = 50;

        foreach (var batch in candidates.Chunk(batchSize))
        {
            ct.ThrowIfCancellationRequested();

            var tasks = batch.Select(c => matching.CalculateScoreAsync(c, job));
            var results = await Task.WhenAll(tasks);

            foreach (var result in results.Where(r => r.Score >= job.MinimumMatchScore))
                await matching.SaveMatchResultAsync(result);

            processed += batch.Length;
            logger.LogInformation("Batch matching progress: {Processed}/{Total}", processed, total);
        }
    }
}

// Schedule
BackgroundJob.Enqueue<BatchMatchingJob>(j => j.ExecuteAsync(jobOfferId, JobCancellationToken.Null));

// Recurring (daily at 2 AM)
RecurringJob.AddOrUpdate<DailyMatchingJob>("daily-matching",
    j => j.ExecuteAsync(JobCancellationToken.Null),
    "0 2 * * *", new RecurringJobOptions { TimeZone = TimeZoneInfo.FindSystemTimeZoneById("Romance Standard Time") });
```

---

## 2. Node.js (BullMQ)

```bash
npm install bullmq ioredis
```

```typescript
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL);

// Producer
const matchingQueue = new Queue('batch-matching', { connection });

await matchingQueue.add('match-job', { jobOfferId: '123' }, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 86400 },  // Keep for 24h
  removeOnFail: { age: 604800 },     // Keep failures for 7d
});

// Worker
const worker = new Worker('batch-matching', async (job) => {
  const { jobOfferId } = job.data;
  const candidates = await candidateRepo.getAllActive();
  const batchSize = 50;

  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(c => matchingService.calculateScore(c, jobOfferId)));
    await job.updateProgress(Math.round((i + batchSize) / candidates.length * 100));
  }
}, { connection, concurrency: 5 });

// Scheduled (repeatable)
await matchingQueue.add('daily-matching', {}, {
  repeat: { pattern: '0 2 * * *' },  // Daily at 2 AM
});
```

---

## 3. Python (Celery)

```bash
pip install celery[redis]
```

```python
from celery import Celery, group, chord

app = Celery('matching', broker='redis://localhost:6379/0')

@app.task(bind=True, max_retries=3, default_retry_delay=60)
def batch_match_candidates(self, job_offer_id: str):
    job = job_repo.get_by_id(job_offer_id)
    candidates = candidate_repo.get_all_active()
    batch_size = 50
    total = len(candidates)

    for i in range(0, total, batch_size):
        batch = candidates[i:i + batch_size]
        results = [matching_service.calculate_score(c, job) for c in batch]
        for r in results:
            if r.score >= job.minimum_match_score:
                matching_repo.save_result(r)
        self.update_state(state='PROGRESS', meta={'processed': min(i + batch_size, total), 'total': total})

# Schedule
app.conf.beat_schedule = {
    'daily-matching': {
        'task': 'batch_match_candidates',
        'schedule': crontab(hour=2, minute=0),
    },
}
```

---

## Chunking Strategy

| Dataset Size | Chunk Size | Concurrency | Notes |
|-------------|-----------|-------------|-------|
| < 1,000 | 100 | 1 | Single batch, synchronous |
| 1,000 - 10,000 | 50-100 | 5 | Parallel chunks |
| 10,000 - 100,000 | 50 | 10 | Parallel + progress tracking |
| 100,000+ | 50 | 20 | Distributed workers + checkpointing |

## Idempotency

```csharp
// Use idempotency keys to prevent duplicate processing
public async Task ProcessBatchAsync(string batchId, List<string> candidateIds)
{
    var processed = await _cache.GetAsync<HashSet<string>>($"batch:{batchId}:processed") ?? [];
    var remaining = candidateIds.Where(id => !processed.Contains(id)).ToList();
    foreach (var id in remaining)
    {
        await ProcessCandidate(id);
        processed.Add(id);
        await _cache.SetAsync($"batch:{batchId}:processed", processed, TimeSpan.FromHours(24));
    }
}
```


## Note: Contexte RH Francais

Le traitement par lots est essentiel pour les operations RH francaises : generation DSN mensuelle (Declaration Sociale Nominative), calcul de paie pour tous les employes, mise a jour des compteurs CPF (Compte Personnel de Formation), et export CNIL des donnees personnelles. Ces traitements doivent inclure un audit trail complet et respecter les fenetre de maintenance definies par la convention collective.
