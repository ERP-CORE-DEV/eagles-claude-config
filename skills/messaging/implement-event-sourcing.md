---
name: implement-event-sourcing
description: Implement event sourcing with event store, projections, and snapshots
argument-hint: [stack: dotnet|node|python] [store: eventstore|marten|custom]
tags: [messaging, event-sourcing, CQRS, domain-events, audit-trail, projections]
---

# Event Sourcing Implementation Guide

Event sourcing stores state as a sequence of events rather than current state. Every change is an immutable event — you never update, only append.

---

## When to Use

| Use Event Sourcing | Use Traditional CRUD |
|-------------------|---------------------|
| Full audit trail required (CNIL compliance) | Simple CRUD with no history needs |
| Complex domain with many state transitions | Stable entities that rarely change |
| Need to replay/rebuild state | Performance-critical hot path |
| Temporal queries ("state at time X") | High write throughput |

---

## 1. .NET 8 (Marten + PostgreSQL)

### Setup

```bash
dotnet add package Marten
dotnet add package Marten.Events.Daemon
```

### Domain Events

```csharp
public record CandidateCreated(string CandidateId, string FullName, string Email, DateTime CreatedAt);
public record CandidateSkillAdded(string CandidateId, string SkillName, int Level);
public record CandidateMatchedToJob(string CandidateId, string JobId, decimal Score, DateTime MatchedAt);
public record CandidateAnonymized(string CandidateId, DateTime AnonymizedAt, string Reason);

public class CandidateAggregate
{
    public string Id { get; private set; } = string.Empty;
    public string FullName { get; private set; } = string.Empty;
    public List<CandidateSkill> Skills { get; } = [];
    public bool IsAnonymized { get; private set; }

    // Marten calls Apply methods to rebuild state from events
    public void Apply(CandidateCreated e) { Id = e.CandidateId; FullName = e.FullName; }
    public void Apply(CandidateSkillAdded e) => Skills.Add(new(e.SkillName, e.Level));
    public void Apply(CandidateAnonymized e) { FullName = "ANONYMIZED"; IsAnonymized = true; }
}
```

### Event Store Operations

```csharp
// Write events
await using var session = store.LightweightSession();
session.Events.StartStream<CandidateAggregate>(candidateId,
    new CandidateCreated(candidateId, "Jean Dupont", "jean@example.com", DateTime.UtcNow),
    new CandidateSkillAdded(candidateId, "C#", 4));
await session.SaveChangesAsync();

// Append to existing stream
session.Events.Append(candidateId,
    new CandidateMatchedToJob(candidateId, jobId, 0.87m, DateTime.UtcNow));
await session.SaveChangesAsync();

// Read current state (Marten replays events automatically)
var candidate = await session.Events.AggregateStreamAsync<CandidateAggregate>(candidateId);

// Read state at a point in time
var pastState = await session.Events.AggregateStreamAsync<CandidateAggregate>(
    candidateId, timestamp: new DateTime(2025, 6, 1));
```

### Projections (Read Models)

```csharp
public class CandidateListProjection : MultiStreamProjection<CandidateListView, string>
{
    public CandidateListProjection()
    {
        Identity<CandidateCreated>(e => e.CandidateId);
        Identity<CandidateSkillAdded>(e => e.CandidateId);
    }

    public void Apply(CandidateCreated e, CandidateListView view)
    {
        view.Id = e.CandidateId;
        view.FullName = e.FullName;
        view.SkillCount = 0;
    }

    public void Apply(CandidateSkillAdded e, CandidateListView view)
        => view.SkillCount++;
}

// Registration
builder.Services.AddMarten(opts =>
{
    opts.Connection(connectionString);
    opts.Projections.Add<CandidateListProjection>(ProjectionLifecycle.Async);
});
```

---

## 2. Node.js (EventStoreDB)

### Setup

```bash
npm install @eventstore/db-client
```

```typescript
import { EventStoreDBClient, jsonEvent } from '@eventstore/db-client';

const client = EventStoreDBClient.connectionString('esdb://localhost:2113?tls=false');

// Write events
const candidateId = crypto.randomUUID();
await client.appendToStream(`candidate-${candidateId}`, [
  jsonEvent({ type: 'CandidateCreated', data: { candidateId, fullName: 'Jean Dupont' } }),
  jsonEvent({ type: 'SkillAdded', data: { candidateId, skillName: 'TypeScript', level: 4 } }),
]);

// Read and rebuild state
const events = client.readStream(`candidate-${candidateId}`);
let state: CandidateState = { skills: [], isAnonymized: false };
for await (const { event } of events) {
  switch (event?.type) {
    case 'CandidateCreated': state = { ...state, ...event.data }; break;
    case 'SkillAdded': state.skills.push(event.data); break;
    case 'CandidateAnonymized': state.isAnonymized = true; break;
  }
}
```

### Subscriptions (Projections)

```typescript
const subscription = client.subscribeToStream('$ce-candidate', {
  fromRevision: 'start',
  resolveLinkTos: true,
});

for await (const { event } of subscription) {
  if (event?.type === 'CandidateCreated') {
    await readModelDb.upsert('candidate_list', { id: event.data.candidateId, ...event.data });
  }
}
```

---

## 3. Python (Custom Event Store)

```python
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

@dataclass(frozen=True)
class DomainEvent:
    aggregate_id: str
    event_type: str
    data: dict[str, Any]
    occurred_at: datetime = field(default_factory=datetime.utcnow)
    version: int = 0

class EventStore:
    def __init__(self, db):
        self._db = db

    async def append(self, stream_id: str, events: list[DomainEvent]) -> None:
        async with self._db.transaction():
            current_version = await self._get_version(stream_id)
            for i, event in enumerate(events):
                await self._db.execute(
                    "INSERT INTO events (stream_id, version, event_type, data, occurred_at) VALUES ($1, $2, $3, $4, $5)",
                    stream_id, current_version + i + 1, event.event_type, json.dumps(event.data), event.occurred_at,
                )

    async def read_stream(self, stream_id: str) -> list[DomainEvent]:
        rows = await self._db.fetch("SELECT * FROM events WHERE stream_id = $1 ORDER BY version", stream_id)
        return [DomainEvent(aggregate_id=r['stream_id'], event_type=r['event_type'], data=json.loads(r['data']), version=r['version']) for r in rows]
```

---

## Snapshots

```csharp
// Take snapshot every N events to avoid replaying entire history
public class SnapshotStrategy
{
    private const int SnapshotInterval = 100;

    public async Task<T> LoadAggregate<T>(IDocumentSession session, string streamId) where T : new()
    {
        var snapshot = await session.LoadAsync<AggregateSnapshot<T>>(streamId);
        var fromVersion = snapshot?.Version ?? 0;
        return await session.Events.AggregateStreamAsync<T>(streamId, fromVersion);
    }
}
```

---

## GDPR Compliance (Event Sourcing)

Events are immutable, but GDPR requires data deletion. Solutions:

| Approach | How | Trade-off |
|----------|-----|-----------|
| Crypto-shredding | Encrypt PII with per-user key; delete key to "erase" | Recommended for event sourcing |
| Event transformation | Replace PII events with anonymized versions | Loses original timestamps |
| Tombstone events | Append `CandidateAnonymized` event | PII still in old events |
