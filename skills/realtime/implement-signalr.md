---
name: implement-signalr
description: Implement real-time communication with ASP.NET Core SignalR (hubs, groups, streaming)
argument-hint: [transport: websocket|sse|longpolling] [client: javascript|dotnet]
tags: [realtime, signalr, websocket, dotnet, push, notifications]
---

# SignalR Real-Time Communication Guide

ASP.NET Core SignalR provides real-time server-to-client communication with automatic transport negotiation.

---

## 1. Server Setup (.NET 8)

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSignalR(options =>
{
    options.EnableDetailedErrors = builder.Environment.IsDevelopment();
    options.KeepAliveInterval = TimeSpan.FromSeconds(15);
    options.ClientTimeoutInterval = TimeSpan.FromSeconds(30);
});
builder.Services.AddCors(o => o.AddPolicy("SignalR", p =>
    p.WithOrigins("http://localhost:3000").AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

var app = builder.Build();
app.UseCors("SignalR");
app.MapHub<NotificationHub>("/hubs/notifications");
app.Run();
```

---

## 2. Hub Implementation

```csharp
public interface INotificationClient
{
    Task ReceiveNotification(NotificationDto notification);
    Task MatchingProgress(MatchingProgressDto progress);
}

public class NotificationHub : Hub<INotificationClient>
{
    public override async Task OnConnectedAsync()
    {
        var userId = Context.UserIdentifier;
        if (userId != null)
            await Groups.AddToGroupAsync(Context.ConnectionId, $"user:{userId}");
        await base.OnConnectedAsync();
    }

    public async Task JoinChannel(string channel)
        => await Groups.AddToGroupAsync(Context.ConnectionId, channel);

    public async Task LeaveChannel(string channel)
        => await Groups.RemoveFromGroupAsync(Context.ConnectionId, channel);
}
```

---

## 3. Send from Services

```csharp
public class MatchingService
{
    private readonly IHubContext<NotificationHub, INotificationClient> _hub;
    public MatchingService(IHubContext<NotificationHub, INotificationClient> hub) => _hub = hub;

    public async Task NotifyProgress(string userId, int percent)
    {
        await _hub.Clients.Group($"user:{userId}")
            .MatchingProgress(new MatchingProgressDto { PercentComplete = percent });
    }
}
```

---

## 4. JavaScript Client (React Hook)

```bash
npm install @microsoft/signalr
```

```tsx
import { HubConnectionBuilder, HubConnectionState } from '@microsoft/signalr';
import { useEffect, useRef, useCallback, useState } from 'react';

function useSignalR(hubUrl: string, accessToken?: () => Promise<string>) {
  const connRef = useRef<HubConnection | null>(null);
  const [state, setState] = useState(HubConnectionState.Disconnected);

  useEffect(() => {
    const conn = new HubConnectionBuilder()
      .withUrl(hubUrl, { accessTokenFactory: accessToken })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .build();
    conn.onreconnecting(() => setState(HubConnectionState.Reconnecting));
    conn.onreconnected(() => setState(HubConnectionState.Connected));
    conn.onclose(() => setState(HubConnectionState.Disconnected));
    connRef.current = conn;
    conn.start().then(() => setState(HubConnectionState.Connected));
    return () => { conn.stop(); };
  }, [hubUrl]);

  const invoke = useCallback(async <T,>(method: string, ...args: unknown[]) => {
    if (connRef.current?.state !== HubConnectionState.Connected) throw new Error('Not connected');
    return connRef.current.invoke<T>(method, ...args);
  }, []);

  const on = useCallback((method: string, handler: (...args: any[]) => void) => {
    connRef.current?.on(method, handler);
    return () => connRef.current?.off(method, handler);
  }, []);

  return { invoke, on, connectionState: state };
}
```

---

## 5. Streaming

```csharp
public async IAsyncEnumerable<ProgressDto> StreamResults(
    Guid jobId, [EnumeratorCancellation] CancellationToken ct)
{
    var items = await _service.GetItemsAsync(jobId);
    for (int i = 0; i < items.Count && !ct.IsCancellationRequested; i++)
    {
        var result = await _service.ProcessAsync(items[i]);
        yield return new ProgressDto { Current = i + 1, Total = items.Count, Score = result.Score };
    }
}
```

```typescript
const sub = connection.stream('StreamResults', jobId).subscribe({
  next: (p) => setProgress(p),
  complete: () => console.log('Done'),
  error: (err) => console.error(err),
});
sub.dispose(); // cancel
```

---

## 6. Authentication

```csharp
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o => o.Events = new JwtBearerEvents {
        OnMessageReceived = ctx => {
            var token = ctx.Request.Query["access_token"];
            if (!string.IsNullOrEmpty(token) && ctx.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                ctx.Token = token;
            return Task.CompletedTask;
        },
    });
```

---

## 7. Scale-Out (Redis Backplane)

```csharp
builder.Services.AddSignalR().AddStackExchangeRedis(o => {
    o.Configuration = builder.Configuration.GetConnectionString("Redis")!;
});
```
