---
name: implement-sse
description: Implement Server-Sent Events for one-way real-time updates
argument-hint: [stack: dotnet|node|python]
tags: [realtime, SSE, server-sent-events, streaming, push, notifications]
---

# Server-Sent Events (SSE) Guide

SSE provides simple one-way server-to-client streaming over HTTP. Lighter than WebSockets for notifications, live feeds, and progress updates.

---

## .NET 8

```csharp
app.MapGet("/api/events", async (HttpContext context, CancellationToken ct) =>
{
    context.Response.Headers.Append("Content-Type", "text/event-stream");
    context.Response.Headers.Append("Cache-Control", "no-cache");
    context.Response.Headers.Append("Connection", "keep-alive");

    var counter = 0;
    while (!ct.IsCancellationRequested)
    {
        await context.Response.WriteAsync($"id: {counter}\ndata: {JsonSerializer.Serialize(new { time = DateTime.UtcNow, count = counter })}\n\n", ct);
        await context.Response.Body.FlushAsync(ct);
        counter++;
        await Task.Delay(1000, ct);
    }
});

// Named events
await context.Response.WriteAsync($"event: notification\ndata: {json}\n\n");
await context.Response.WriteAsync($"event: progress\ndata: {json}\n\n");
```

---

## Node.js / Express

```javascript
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const interval = setInterval(() => {
    res.write(`data: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`);
  }, 1000);

  req.on('close', () => clearInterval(interval));
});
```

---

## Python / FastAPI

```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
import asyncio, json

@app.get("/api/events")
async def events():
    async def generate():
        counter = 0
        while True:
            data = json.dumps({"count": counter, "time": str(datetime.utcnow())})
            yield f"data: {data}\n\n"
            counter += 1
            await asyncio.sleep(1)

    return StreamingResponse(generate(), media_type="text/event-stream")
```

---

## JavaScript Client

```typescript
const eventSource = new EventSource('/api/events');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};

eventSource.addEventListener('notification', (event) => {
  const notification = JSON.parse(event.data);
  showToast(notification);
});

eventSource.onerror = () => {
  console.log('Connection lost, auto-reconnecting...');
};

// Close when done
eventSource.close();
```

### React Hook

```tsx
function useSSE<T>(url: string, eventName?: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const source = new EventSource(url);
    const handler = (e: MessageEvent) => { setData(JSON.parse(e.data)); setError(null); };

    if (eventName) source.addEventListener(eventName, handler);
    else source.onmessage = handler;

    source.onerror = () => setError('Connection lost');
    return () => source.close();
  }, [url, eventName]);

  return { data, error };
}

// Usage
function ProgressBar() {
  const { data } = useSSE<{ percent: number }>('/api/matching/progress');
  return <progress value={data?.percent ?? 0} max={100} />;
}
```

---

## SSE vs WebSocket vs SignalR

| Feature | SSE | WebSocket | SignalR |
|---------|-----|-----------|---------|
| Direction | Server to client | Bidirectional | Bidirectional |
| Protocol | HTTP | WS | WS/SSE/LP |
| Reconnect | Automatic | Manual | Automatic |
| Complexity | Low | Medium | Medium |
| Best for | Notifications, feeds | Chat, gaming | .NET real-time |
