---
name: implement-global-exception-handler
description: Create global exception handling middleware to catch and log all unhandled exceptions
argument-hint: [stack: dotnet|node|python]
---

# Global Exception Handler

## .NET Middleware
```csharp
public class GlobalExceptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<GlobalExceptionMiddleware> _logger;

    public GlobalExceptionMiddleware(RequestDelegate next, ILogger<GlobalExceptionMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            await HandleExceptionAsync(context, ex);
        }
    }

    private async Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        _logger.LogError(exception, "Unhandled exception occurred");

        context.Response.ContentType = "application/json";

        var (statusCode, message) = exception switch
        {
            NotFoundException => (StatusCodes.Status404NotFound, "Resource not found"),
            ValidationException => (StatusCodes.Status400BadRequest, exception.Message),
            UnauthorizedException => (StatusCodes.Status401Unauthorized, "Unauthorized"),
            _ => (StatusCodes.Status500InternalServerError, "Internal server error")
        };

        context.Response.StatusCode = statusCode;

        var response = new
        {
            error = message,
            traceId = context.TraceIdentifier,
            timestamp = DateTime.UtcNow
        };

        await context.Response.WriteAsJsonAsync(response);
    }
}

// Register in Program.cs
app.UseMiddleware<GlobalExceptionMiddleware>();
```

## Node.js/Express
```javascript
// Error handler middleware (must be last)
app.use((err, req, res, next) => {
  console.error(err.stack);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    error: message,
    traceId: req.id,
    timestamp: new Date().toISOString()
  });
});
```

## Python/Flask
```python
from flask import Flask, jsonify

app = Flask(__name__)

@app.errorhandler(Exception)
def handle_exception(e):
    app.logger.error(f"Unhandled exception: {e}")

    if isinstance(e, HTTPException):
        return jsonify(error=e.description), e.code

    return jsonify(error="Internal server error"), 500
```
