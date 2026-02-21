---
name: setup-azure-service-bus
description: Configure Azure Service Bus for async messaging (queues, topics, dead-letter)
argument-hint: [pattern: queue|topic|session] [stack: dotnet|node|python]
tags: [messaging, azure, service-bus, async, queues, topics, dead-letter]
---

# Azure Service Bus Setup Guide

Azure Service Bus provides enterprise-grade messaging for decoupled microservice communication.

---

## Queues vs Topics

| Feature | Queue | Topic + Subscription |
|---------|-------|---------------------|
| Pattern | Point-to-point | Publish-subscribe |
| Consumers | 1 (competing consumers) | Many (each gets a copy) |
| Use case | Job processing, commands | Events, notifications |
| Example | `process-matching-job` | `candidate-events` → `matching-sub`, `notification-sub` |

---

## 1. .NET 8

### Setup

```bash
dotnet add package Azure.Messaging.ServiceBus
```

### Send Messages

```csharp
public class MatchingEventPublisher(ServiceBusClient client)
{
    private readonly ServiceBusSender _sender = client.CreateSender("candidate-events");

    public async Task PublishAsync<T>(T @event, CancellationToken ct = default) where T : class
    {
        var message = new ServiceBusMessage(JsonSerializer.SerializeToUtf8Bytes(@event))
        {
            ContentType = "application/json",
            Subject = typeof(T).Name,
            MessageId = Guid.NewGuid().ToString(),
            CorrelationId = Activity.Current?.Id,
            ApplicationProperties = { ["EventType"] = typeof(T).Name }
        };
        await _sender.SendMessageAsync(message, ct);
    }

    // Batch send (more efficient)
    public async Task PublishBatchAsync<T>(IEnumerable<T> events, CancellationToken ct = default)
    {
        using var batch = await _sender.CreateMessageBatchAsync(ct);
        foreach (var e in events)
        {
            var msg = new ServiceBusMessage(JsonSerializer.SerializeToUtf8Bytes(e))
            { Subject = typeof(T).Name };
            if (!batch.TryAddMessage(msg))
                throw new InvalidOperationException("Message too large for batch");
        }
        await _sender.SendMessageBatchAsync(batch, ct);
    }
}
```

### Receive Messages

```csharp
public class MatchingEventProcessor : BackgroundService
{
    private readonly ServiceBusProcessor _processor;

    public MatchingEventProcessor(ServiceBusClient client)
    {
        _processor = client.CreateProcessor("candidate-events", "matching-subscription",
            new ServiceBusProcessorOptions
            {
                AutoCompleteMessages = false,
                MaxConcurrentCalls = 10,
                PrefetchCount = 20,
                MaxAutoLockRenewalDuration = TimeSpan.FromMinutes(10),
            });
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        _processor.ProcessMessageAsync += async args =>
        {
            var eventType = args.Message.Subject;
            var body = args.Message.Body.ToObjectFromJson<JsonElement>();
            // Route to handler based on eventType
            await args.CompleteMessageAsync(args.Message, ct);
        };

        _processor.ProcessErrorAsync += args =>
        {
            // Log error, don't throw
            return Task.CompletedTask;
        };

        await _processor.StartProcessingAsync(ct);
    }
}

// DI registration
builder.Services.AddSingleton(_ => new ServiceBusClient(connectionString));
builder.Services.AddHostedService<MatchingEventProcessor>();
```

### Dead-Letter Handling

```csharp
public class DeadLetterProcessor : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        var receiver = _client.CreateReceiver("candidate-events", "matching-subscription",
            new ServiceBusReceiverOptions { SubQueue = SubQueue.DeadLetter });

        while (!ct.IsCancellationRequested)
        {
            var msg = await receiver.ReceiveMessageAsync(TimeSpan.FromSeconds(30), ct);
            if (msg is null) continue;

            _logger.LogWarning("Dead letter: {Reason} - {Description}",
                msg.DeadLetterReason, msg.DeadLetterErrorDescription);
            // Attempt reprocessing or alert
        }
    }
}
```

---

## 2. Node.js

```bash
npm install @azure/service-bus
```

```typescript
import { ServiceBusClient } from '@azure/service-bus';

const client = new ServiceBusClient(connectionString);

// Send
const sender = client.createSender('candidate-events');
await sender.sendMessages({
  body: { candidateId: '123', eventType: 'CandidateMatched', score: 0.87 },
  contentType: 'application/json',
  subject: 'CandidateMatched',
  correlationId: crypto.randomUUID(),
});

// Receive
const receiver = client.createReceiver('candidate-events', 'matching-sub');
const subscription = receiver.subscribe({
  processMessage: async (msg) => {
    console.log(`Event: ${msg.subject}`, msg.body);
    await receiver.completeMessage(msg);
  },
  processError: async (err) => {
    console.error('Service Bus error:', err);
  },
});
```

---

## 3. Python

```bash
pip install azure-servicebus
```

```python
from azure.servicebus.aio import ServiceBusClient

async with ServiceBusClient.from_connection_string(conn_str) as client:
    sender = client.get_topic_sender("candidate-events")
    async with sender:
        await sender.send_messages(ServiceBusMessage(
            json.dumps({"candidateId": "123", "event": "matched"}),
            content_type="application/json",
            subject="CandidateMatched",
        ))

    receiver = client.get_subscription_receiver("candidate-events", "matching-sub")
    async with receiver:
        messages = await receiver.receive_messages(max_message_count=10, max_wait_time=5)
        for msg in messages:
            print(f"Received: {msg.subject} - {str(msg)}")
            await receiver.complete_message(msg)
```

---

## Retry Policy

```csharp
builder.Services.AddSingleton(_ => new ServiceBusClient(connectionString,
    new ServiceBusClientOptions
    {
        RetryOptions = new ServiceBusRetryOptions
        {
            Mode = ServiceBusRetryMode.Exponential,
            MaxRetries = 5,
            Delay = TimeSpan.FromSeconds(1),
            MaxDelay = TimeSpan.FromSeconds(30),
        }
    }));
```

---

## Best Practices

| Practice | Why |
|----------|-----|
| Use topics for events, queues for commands | Events have multiple consumers, commands have one |
| Set `MaxDeliveryCount` (default 10) | Poison messages go to dead-letter after N failures |
| Use sessions for ordered processing | Messages with same `SessionId` processed in order |
| Enable duplicate detection | Prevents duplicate event processing |
| Set message TTL | Prevent stale messages from accumulating |
