---
name: implement-webhooks
description: Implement webhook system for event-driven integrations
---
# Implement Webhook System for Event-Driven Integrations

Production-ready webhook infrastructure covering sender, receiver, registration,
payload signing, retry logic, idempotency, logging, and security validation.

---

## 1. Webhook Registration API

Define a registration endpoint so consumers can subscribe to events.

### Data Model

\x60\x60\x60
WebhookSubscription:
  id: string (GUID)
  url: string (HTTPS endpoint)
  secret: string (HMAC signing key, auto-generated)
  events: string[] (e.g., ["candidate.matched", "job.published"])
  isActive: boolean
  createdAt: datetime
  updatedAt: datetime
\x60\x60\x60

### REST Endpoints

\x60\x60\x60
POST   /api/webhooks          -- Register a new subscription
GET    /api/webhooks          -- List all subscriptions
GET    /api/webhooks/{id}     -- Get subscription details
PATCH  /api/webhooks/{id}     -- Update subscription (url, events, isActive)
DELETE /api/webhooks/{id}     -- Remove subscription
POST   /api/webhooks/{id}/test -- Send a test ping event
GET    /api/webhooks/{id}/logs -- Retrieve delivery logs for debugging
\x60\x60\x60

### Webhook Event Types

Define a typed catalog of events. Examples for an HR system:

\x60\x60\x60
candidate.created       -- New candidate registered
candidate.updated       -- Candidate profile changed
candidate.matched       -- Candidate matched to a job
job.published           -- Job offer published
job.closed              -- Job offer closed
application.submitted   -- Application received
application.reviewed    -- Application status changed
interview.scheduled     -- Interview date set
offer.sent              -- Offer letter dispatched
offer.accepted          -- Candidate accepted offer
\x60\x60\x60


## French HR Context

Webhooks in RH-OptimERP notify external systems of HR events:
- **Candidate status change** -> ATS integration
- **Contract signed** -> Payroll system
- **Training completed** -> CPF account update
- **Employee termination** -> DSN notification

### .NET 8 Webhook Implementation

```csharp
// Domain/Models/WebhookSubscription.cs
public class WebhookSubscription
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string CompanyId { get; set; } = string.Empty;
    public string EventType { get; set; } = string.Empty; // e.g., "candidate.status_changed"
    public string CallbackUrl { get; set; } = string.Empty;
    public string? Secret { get; set; } // HMAC signing secret
    public bool IsActive { get; set; } = true;
    public int RetryCount { get; set; } = 3;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

// Services/WebhookService.cs
public class WebhookService : IWebhookService
{
    private readonly IWebhookRepository _repository;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<WebhookService> _logger;

    public async Task PublishEventAsync(string eventType, object payload)
    {
        var subscriptions = await _repository.GetActiveByEventTypeAsync(eventType);

        foreach (var sub in subscriptions)
        {
            try
            {
                await SendWebhookAsync(sub, eventType, payload);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "Webhook echoue pour {EventType} vers {Url}",
                    eventType, sub.CallbackUrl);

                // Queue for retry
                await _retryQueue.EnqueueAsync(new WebhookRetry
                {
                    SubscriptionId = sub.Id,
                    EventType = eventType,
                    Payload = payload,
                    AttemptNumber = 1,
                    MaxAttempts = sub.RetryCount
                });
            }
        }
    }

    private async Task SendWebhookAsync(WebhookSubscription sub, string eventType, object payload)
    {
        var client = _httpClientFactory.CreateClient("webhook");

        var body = new
        {
            @event = eventType,
            timestamp = DateTime.UtcNow,
            data = payload
        };

        var json = System.Text.Json.JsonSerializer.Serialize(body);
        var content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");

        // HMAC signature for verification
        if (!string.IsNullOrEmpty(sub.Secret))
        {
            var signature = ComputeHmacSha256(json, sub.Secret);
            content.Headers.Add("X-Webhook-Signature", $"sha256={signature}");
        }

        content.Headers.Add("X-Webhook-Event", eventType);

        var response = await client.PostAsync(sub.CallbackUrl, content);
        response.EnsureSuccessStatusCode();
    }

    private string ComputeHmacSha256(string payload, string secret)
    {
        using var hmac = new System.Security.Cryptography.HMACSHA256(
            System.Text.Encoding.UTF8.GetBytes(secret));
        var hash = hmac.ComputeHash(System.Text.Encoding.UTF8.GetBytes(payload));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}
```

### Webhook Controller

```csharp
[ApiController]
[Route("api/webhooks")]
public class WebhooksController : ControllerBase
{
    private readonly IWebhookService _webhookService;

    [HttpPost("subscribe")]
    [Authorize(Policy = "system.webhooks.manage")]
    public async Task<IActionResult> Subscribe([FromBody] WebhookSubscribeRequest request)
    {
        var subscription = await _webhookService.SubscribeAsync(
            request.EventType,
            request.CallbackUrl,
            request.Secret
        );

        return CreatedAtAction(nameof(GetSubscription),
            new { id = subscription.Id }, subscription);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetSubscription(string id)
    {
        var sub = await _webhookService.GetByIdAsync(id);
        return sub == null ? NotFound() : Ok(sub);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Unsubscribe(string id)
    {
        await _webhookService.UnsubscribeAsync(id);
        return NoContent();
    }
}

public record WebhookSubscribeRequest(
    string EventType,
    string CallbackUrl,
    string? Secret
);
```

### Node.js/TypeScript

```typescript
// services/webhookService.ts
import crypto from 'crypto';
import axios from 'axios';

export class WebhookService {
  async publishEvent(eventType: string, payload: unknown): Promise<void> {
    const subscriptions = await this.repository.getActiveByEventType(eventType);

    await Promise.allSettled(
      subscriptions.map(sub => this.sendWebhook(sub, eventType, payload))
    );
  }

  private async sendWebhook(sub: WebhookSubscription, eventType: string, payload: unknown): Promise<void> {
    const body = JSON.stringify({ event: eventType, timestamp: new Date(), data: payload });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Event': eventType
    };

    if (sub.secret) {
      const signature = crypto.createHmac('sha256', sub.secret).update(body).digest('hex');
      headers['X-Webhook-Signature'] = `sha256=${signature}`;
    }

    await axios.post(sub.callbackUrl, body, { headers, timeout: 10000 });
  }
}
```

### Event Types for RH-OptimERP

| Event | Description | Payload |
|-------|-------------|---------|
| `candidate.created` | Nouveau candidat | CandidateDto |
| `candidate.status_changed` | Changement de statut | { candidateId, oldStatus, newStatus } |
| `job_posting.published` | Offre publiee | JobPostingDto |
| `contract.signed` | Contrat signe | { employeeId, contractType, startDate } |
| `training.completed` | Formation terminee | { employeeId, trainingId, cpfHours } |

## Testing

```csharp
[Fact]
public async Task PublishEvent_SendsToAllSubscribers()
{
    // Arrange
    var mockHttp = new MockHttpMessageHandler();
    mockHttp.When("https://webhook1.example.com").Respond(HttpStatusCode.OK);
    mockHttp.When("https://webhook2.example.com").Respond(HttpStatusCode.OK);

    // Act
    await _webhookService.PublishEventAsync("candidate.created", new { id = "123" });

    // Assert
    Assert.Equal(2, mockHttp.GetMatchCount()); // Both subscribers received
}
```

## Related Skills

- `/setup-azure-service-bus` - Event-driven webhook triggers
- `/implement-event-sourcing` - Event sourcing with webhook projections
