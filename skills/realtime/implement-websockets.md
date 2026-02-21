---
name: implement-websockets
description: Implement WebSocket communication for real-time bidirectional data
---

# WebSocket Implementation Guide

## Overview

WebSockets provide full-duplex communication over a single TCP connection. Unlike HTTP request-response, WebSockets keep the connection open, allowing the server to push data to clients instantly. Use for: live dashboards, chat, notifications, collaborative editing, real-time matching updates.

---

## .NET 8 — Native WebSocket Middleware

.NET 8 includes built-in WebSocket support without requiring SignalR. This approach gives fine-grained control over the connection lifecycle.

### Program.cs Setup

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<WebSocketConnectionManager>();
builder.Services.AddSingleton<MessageRouter>();

var app = builder.Build();
app.UseWebSockets(new WebSocketOptions
{
    KeepAliveInterval = TimeSpan.FromSeconds(30) // server-side ping interval
});

app.Map("/ws", async (HttpContext context, WebSocketConnectionManager manager, MessageRouter router) =>
{
    if (!context.WebSockets.IsWebSocketRequest)
    {
        context.Response.StatusCode = 400;
        return;
    }

    // Authenticate before accepting the socket
    var token = context.Request.Query["access_token"].ToString();
    var principal = await AuthenticateToken(token);
    if (principal is null)
    {
        context.Response.StatusCode = 401;
        return;
    }

    using var ws = await context.WebSockets.AcceptWebSocketAsync();
    var connectionId = manager.Add(ws, principal.Identity.Name);

    try
    {
        await router.HandleConnection(ws, connectionId);
    }
    finally
    {
        manager.Remove(connectionId);
    }
});

app.Run();
```

### Connection Manager with Rooms

```csharp
public class WebSocketConnectionManager
{
    private readonly ConcurrentDictionary<string, WebSocketConnection> _connections = new();
    private readonly ConcurrentDictionary<string, HashSet<string>> _rooms = new();

    public string Add(WebSocket socket, string userId)
    {
        var id = Guid.NewGuid().ToString("N");
        _connections[id] = new WebSocketConnection(id, socket, userId);
        return id;
    }

    public void Remove(string connectionId)
    {
        _connections.TryRemove(connectionId, out _);
        foreach (var room in _rooms.Values)
            room.Remove(connectionId);
    }

    public WebSocketConnection? GetConnection(string connectionId)
    {
        _connections.TryGetValue(connectionId, out var conn);
        return conn;
    }

    public void JoinRoom(string connectionId, string room)
    {
        _rooms.GetOrAdd(room, _ => new HashSet<string>()).Add(connectionId);
    }

    public void LeaveRoom(string connectionId, string room)
    {
        if (_rooms.TryGetValue(room, out var members))
            members.Remove(connectionId);
    }

    public async Task BroadcastToRoom(string room, byte[] payload, WebSocketMessageType type)
    {
        if (!_rooms.TryGetValue(room, out var members)) return;
        var tasks = members
            .Where(id => _connections.ContainsKey(id))
            .Select(id => _connections[id].Socket.SendAsync(
                new ArraySegment<byte>(payload), type, true, CancellationToken.None));
        await Task.WhenAll(tasks);
    }
}

public record WebSocketConnection(string Id, WebSocket Socket, string UserId);
```

### Message Router with Heartbeat

```csharp
public class MessageRouter
{
    private readonly WebSocketConnectionManager _manager;

    public MessageRouter(WebSocketConnectionManager manager) => _manager = manager;

    public async Task HandleConnection(WebSocket ws, string connectionId)
    {
        var buffer = new byte[4096];
        while (ws.State == WebSocketState.Open)
        {
            var result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);

            if (result.MessageType == WebSocketMessageType.Close)
            {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", CancellationToken.None);
                break;
            }

            if (result.MessageType == WebSocketMessageType.Text)
            {
                var message = Encoding.UTF8.GetString(buffer, 0, result.Count);
                await RouteMessage(connectionId, message);
            }

            // Binary messages: forward as-is to the target room
            if (result.MessageType == WebSocketMessageType.Binary)
            {
                var payload = buffer[..result.Count];
                await _manager.BroadcastToRoom("binary-stream", payload, WebSocketMessageType.Binary);
            }
        }
    }

    private async Task RouteMessage(string connectionId, string raw)
    {
        var envelope = JsonSerializer.Deserialize<MessageEnvelope>(raw);
        switch (envelope?.Type)
        {
            case "ping":
                var conn = _manager.GetConnection(connectionId);
                if (conn is not null)
                    await conn.Socket.SendAsync(
                        Encoding.UTF8.GetBytes("{\"type\":\"pong\"}"),
                        WebSocketMessageType.Text, true, CancellationToken.None);
                break;
            case "join":
                _manager.JoinRoom(connectionId, envelope.Room);
                break;
            case "leave":
                _manager.LeaveRoom(connectionId, envelope.Room);
                break;
            case "broadcast":
                await _manager.BroadcastToRoom(
                    envelope.Room, Encoding.UTF8.GetBytes(envelope.Payload), WebSocketMessageType.Text);
                break;
        }
    }
}

public record MessageEnvelope(string Type, string Room, string Payload);
```

---

## Node.js — ws Library + Socket.IO

### Raw ws Server (lightweight, no abstraction)

```javascript
import { WebSocketServer } from "ws";
import { createServer } from "http";
import { verifyJwt } from "./auth.js";

const server = createServer();
const wss = new WebSocketServer({ noServer: true });

// Authenticate during HTTP upgrade
server.on("upgrade", async (req, socket, head) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get("token");
    const user = await verifyJwt(token);
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.user = user;
      wss.emit("connection", ws, req);
    });
  } catch {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
  }
});

// Heartbeat: detect dead connections
function heartbeat() { this.isAlive = true; }

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", heartbeat);

  ws.on("message", (data, isBinary) => {
    if (isBinary) {
      // Forward binary to all clients in the same room
      broadcastBinary(ws.room, data);
      return;
    }
    const msg = JSON.parse(data.toString());
    handleMessage(ws, msg);
  });

  ws.on("close", () => leaveAllRooms(ws));
  ws.on("error", (err) => console.error(`WS error [${ws.user?.id}]:`, err.message));
});

// Ping every 30s, terminate unresponsive connections
const pingInterval = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000);

wss.on("close", () => clearInterval(pingInterval));
server.listen(8080);
```

### Socket.IO (higher-level with rooms, namespaces, auto-reconnect)

```javascript
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";

const io = new Server(httpServer, {
  cors: { origin: process.env.ALLOWED_ORIGINS?.split(",") },
  pingInterval: 25000,
  pingTimeout: 20000,
});

// Redis adapter for horizontal scaling across multiple nodes
const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();
await Promise.all([pubClient.connect(), subClient.connect()]);
io.adapter(createAdapter(pubClient, subClient));

// Authentication middleware
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  try {
    socket.user = await verifyJwt(token);
    next();
  } catch {
    next(new Error("Authentication failed"));
  }
});

io.on("connection", (socket) => {
  console.log(`Connected: ${socket.user.id}`);

  socket.on("join-room", (room) => {
    socket.join(room);
    socket.to(room).emit("user-joined", { userId: socket.user.id });
  });

  socket.on("leave-room", (room) => {
    socket.leave(room);
    socket.to(room).emit("user-left", { userId: socket.user.id });
  });

  socket.on("message", ({ room, payload }) => {
    io.to(room).emit("message", { from: socket.user.id, payload });
  });

  socket.on("disconnect", (reason) => {
    console.log(`Disconnected: ${socket.user.id}, reason: ${reason}`);
  });
});
```

---

## Python — websockets + FastAPI WebSocket

### FastAPI Native WebSocket

```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, status
from jose import jwt, JWTError
from uuid import uuid4
import asyncio
import json

app = FastAPI()
SECRET_KEY = "your-secret-key"

class ConnectionManager:
    def __init__(self):
        self.active: dict[str, WebSocket] = {}
        self.rooms: dict[str, set[str]] = {}

    async def connect(self, ws: WebSocket, conn_id: str):
        await ws.accept()
        self.active[conn_id] = ws

    def disconnect(self, conn_id: str):
        self.active.pop(conn_id, None)
        for members in self.rooms.values():
            members.discard(conn_id)

    def join_room(self, conn_id: str, room: str):
        self.rooms.setdefault(room, set()).add(conn_id)

    def leave_room(self, conn_id: str, room: str):
        if room in self.rooms:
            self.rooms[room].discard(conn_id)

    async def broadcast_to_room(self, room: str, message: str):
        for conn_id in list(self.rooms.get(room, [])):
            ws = self.active.get(conn_id)
            if ws:
                await ws.send_text(message)

    async def send_binary(self, conn_id: str, data: bytes):
        ws = self.active.get(conn_id)
        if ws:
            await ws.send_bytes(data)

manager = ConnectionManager()

async def authenticate(token: str) -> dict | None:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    except JWTError:
        return None

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, token: str = Query(...)):
    user = await authenticate(token)
    if not user:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    conn_id = str(uuid4())
    await manager.connect(ws, conn_id)

    # Heartbeat task: send ping every 30s
    async def heartbeat():
        while True:
            try:
                await asyncio.sleep(30)
                await ws.send_json({"type": "ping"})
            except Exception:
                break

    hb_task = asyncio.create_task(heartbeat())

    try:
        while True:
            data = await ws.receive()
            if "text" in data:
                msg = json.loads(data["text"])
                await route_message(conn_id, msg)
            elif "bytes" in data:
                await handle_binary(conn_id, data["bytes"])
    except WebSocketDisconnect:
        pass
    finally:
        hb_task.cancel()
        manager.disconnect(conn_id)

async def route_message(conn_id: str, msg: dict):
    match msg.get("type"):
        case "pong":
            pass  # client responded to heartbeat
        case "join":
            manager.join_room(conn_id, msg["room"])
        case "leave":
            manager.leave_room(conn_id, msg["room"])
        case "broadcast":
            await manager.broadcast_to_room(msg["room"], json.dumps(msg["payload"]))
```

---

## Client-Side Reconnection with Exponential Backoff

```javascript
class ReconnectingWebSocket {
  constructor(url, options = {}) {
    this.url = url;
    this.maxRetries = options.maxRetries ?? 10;
    this.baseDelay = options.baseDelay ?? 1000;    // 1 second
    this.maxDelay = options.maxDelay ?? 30000;      // 30 seconds
    this.jitterFactor = options.jitterFactor ?? 0.3;
    this.retries = 0;
    this.handlers = { open: [], message: [], close: [], error: [] };
    this.connect();
  }

  connect() {
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      this.retries = 0; // reset on successful connection
      this.handlers.open.forEach((h) => h());
    };
    this.ws.onmessage = (e) => this.handlers.message.forEach((h) => h(e));
    this.ws.onclose = (e) => {
      this.handlers.close.forEach((h) => h(e));
      if (!e.wasClean) this.scheduleReconnect();
    };
    this.ws.onerror = (e) => this.handlers.error.forEach((h) => h(e));
  }

  scheduleReconnect() {
    if (this.retries >= this.maxRetries) return;
    const delay = Math.min(
      this.baseDelay * 2 ** this.retries,
      this.maxDelay
    );
    const jitter = delay * this.jitterFactor * (Math.random() * 2 - 1);
    this.retries++;
    setTimeout(() => this.connect(), delay + jitter);
  }

  send(data) { this.ws.readyState === WebSocket.OPEN && this.ws.send(data); }
  on(event, handler) { this.handlers[event]?.push(handler); }
  close() { this.maxRetries = 0; this.ws.close(); }
}
```

---

## Scaling with Redis Pub/Sub

When running multiple server instances behind a load balancer, WebSocket connections are pinned to a single process. Redis pub/sub bridges messages across all instances.

### Pattern (applies to all stacks)

```
Client A --> Server 1 --publish--> Redis <--subscribe-- Server 2 --> Client B
```

### .NET 8 Redis Bridge

```csharp
// In Program.cs
builder.Services.AddSingleton<IConnectionMultiplexer>(
    ConnectionMultiplexer.Connect(builder.Configuration["Redis:ConnectionString"]));

// In a background service
public class RedisBridgeService : BackgroundService
{
    private readonly IConnectionMultiplexer _redis;
    private readonly WebSocketConnectionManager _manager;

    public RedisBridgeService(IConnectionMultiplexer redis, WebSocketConnectionManager manager)
    {
        _redis = redis;
        _manager = manager;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        var sub = _redis.GetSubscriber();
        await sub.SubscribeAsync("ws:broadcast", async (channel, message) =>
        {
            var envelope = JsonSerializer.Deserialize<BroadcastEnvelope>(message);
            await _manager.BroadcastToRoom(
                envelope.Room,
                Encoding.UTF8.GetBytes(envelope.Payload),
                WebSocketMessageType.Text);
        });
    }
}
```

---

## Error Handling Best Practices

1. **Graceful close**: Always send a close frame with a reason code before terminating.
2. **Try/catch around send**: The socket may have closed between your check and the send call.
3. **Close codes**: Use standard codes (1000 = normal, 1001 = going away, 1008 = policy violation, 1011 = server error).
4. **Message validation**: Deserialize inside try/catch; malformed messages must not crash the handler.
5. **Connection limits**: Cap per-user connections to prevent resource exhaustion.
6. **Idle timeout**: Disconnect clients that have not responded to pings within the timeout window.
7. **Backpressure**: Monitor send buffer size; drop or queue messages if the client cannot keep up.

```csharp
// .NET safe send pattern
async Task SafeSend(WebSocket ws, string message, ILogger logger)
{
    if (ws.State != WebSocketState.Open) return;
    try
    {
        var bytes = Encoding.UTF8.GetBytes(message);
        await ws.SendAsync(new ArraySegment<byte>(bytes),
            WebSocketMessageType.Text, true, CancellationToken.None);
    }
    catch (WebSocketException ex)
    {
        // Log and clean up; do not rethrow
        logger.LogWarning("Send failed: {Message}", ex.Message);
    }
}
```

---

## Message Protocol Convention

Use a consistent JSON envelope for all text messages:

```json
{
  "type": "join | leave | broadcast | ping | pong | error",
  "room": "optional-room-id",
  "payload": {},
  "timestamp": "2026-02-07T10:00:00Z"
}
```

For binary messages, use the first 4 bytes as a message-type header (uint32), followed by the raw payload. This avoids JSON parsing overhead for high-throughput binary streams (file uploads, audio, video frames).
