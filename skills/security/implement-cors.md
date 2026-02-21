---
name: implement-cors
description: Configure CORS (Cross-Origin Resource Sharing) securely for API endpoints
argument-hint: [policy: restrictive|permissive|custom] [stack: dotnet|node|python]
---

# Implement CORS Configuration

Configure Cross-Origin Resource Sharing to allow frontend applications to call your API securely.

## What is CORS?

CORS is a security mechanism that controls which domains can make requests to your API. Browsers enforce the Same-Origin Policy, which blocks requests from different origins unless explicitly allowed via CORS headers.

## CORS Flow

1. Browser sends **preflight request** (OPTIONS) with Origin header
2. Server responds with Access-Control-Allow-Origin header
3. If allowed, browser sends actual request
4. Server includes CORS headers in response

## Implementation by Stack

### .NET 8 CORS Configuration

```csharp
// Program.cs
var builder = WebApplication.CreateBuilder(args);

// ===== OPTION 1: Named CORS Policy (Recommended) =====
builder.Services.AddCors(options =>
{
    // Restrictive policy for production
    options.AddPolicy("ProductionPolicy", policy =>
    {
        policy.WithOrigins(
                "https://app.example.com",
                "https://admin.example.com"
            )
            .WithMethods("GET", "POST", "PUT", "DELETE")
            .WithHeaders("Content-Type", "Authorization")
            .WithExposedHeaders("X-Pagination")
            .SetPreflightMaxAge(TimeSpan.FromMinutes(10))
            .AllowCredentials(); // For cookies/auth
    });

    // Permissive policy for development
    options.AddPolicy("DevelopmentPolicy", policy =>
    {
        policy.WithOrigins("http://localhost:3000", "http://localhost:5173")
            .AllowAnyMethod()
            .AllowAnyHeader()
            .AllowCredentials();
    });

    // Public API policy (no credentials)
    options.AddPolicy("PublicApiPolicy", policy =>
    {
        policy.AllowAnyOrigin()
            .WithMethods("GET")
            .WithHeaders("Content-Type");
        // Note: AllowAnyOrigin() cannot be used with AllowCredentials()
    });
});

var app = builder.Build();

// Apply CORS policy globally
if (app.Environment.IsDevelopment())
{
    app.UseCors("DevelopmentPolicy");
}
else
{
    app.UseCors("ProductionPolicy");
}

// IMPORTANT: UseCors() must be called before UseAuthorization()
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.Run();
```

#### Per-Endpoint CORS

```csharp
// Apply CORS to specific controller
[ApiController]
[Route("api/[controller]")]
[EnableCors("ProductionPolicy")] // Apply policy to whole controller
public class ProductsController : ControllerBase
{
    [HttpGet]
    public IActionResult GetProducts()
    {
        return Ok(_products);
    }

    [HttpGet("public")]
    [EnableCors("PublicApiPolicy")] // Override for specific endpoint
    public IActionResult GetPublicProducts()
    {
        return Ok(_publicProducts);
    }

    [HttpPost]
    [DisableCors] // Disable CORS for specific endpoint
    public IActionResult CreateProduct([FromBody] Product product)
    {
        // Only same-origin requests allowed
        return Ok();
    }
}
```

### Node.js/Express CORS

```javascript
// app.js
const express = require('express');
const cors = require('cors');

const app = express();

// ===== OPTION 1: Simple (Development Only) =====
// Allow all origins - NEVER use in production
app.use(cors());

// ===== OPTION 2: Specific Origins (Production) =====
const corsOptions = {
  origin: ['https://app.example.com', 'https://admin.example.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-Pagination'],
  credentials: true, // Allow cookies
  maxAge: 600, // Preflight cache (seconds)
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// ===== OPTION 3: Dynamic Origin Validation =====
const allowedOrigins = [
  'https://app.example.com',
  'https://admin.example.com',
  /^https:\/\/.*\.example\.com$/ // Allow subdomains
];

const dynamicCorsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) return callback(null, true);

    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') {
        return allowed === origin;
      } else if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return false;
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};

app.use(cors(dynamicCorsOptions));

// ===== OPTION 4: Per-Route CORS =====
// Public endpoint - allow any origin
app.get('/api/public/products', cors(), (req, res) => {
  res.json(products);
});

// Protected endpoint - specific origins only
app.post('/api/products', cors(corsOptions), (req, res) => {
  // Create product
});

// ===== OPTION 5: Manual CORS Headers (No middleware) =====
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://app.example.com');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

// Environment-based configuration
const envCorsOptions = process.env.NODE_ENV === 'production'
  ? {
      origin: ['https://app.example.com'],
      credentials: true
    }
  : {
      origin: ['http://localhost:3000', 'http://localhost:5173'],
      credentials: true
    };

app.use(cors(envCorsOptions));
```

### Python/Flask CORS

```python
# app.py
from flask import Flask
from flask_cors import CORS

app = Flask(__name__)

# ===== OPTION 1: Simple (Development Only) =====
# Allow all origins
CORS(app)

# ===== OPTION 2: Specific Origins (Production) =====
cors_config = {
    "origins": ["https://app.example.com", "https://admin.example.com"],
    "methods": ["GET", "POST", "PUT", "DELETE"],
    "allow_headers": ["Content-Type", "Authorization"],
    "expose_headers": ["X-Pagination"],
    "supports_credentials": True,
    "max_age": 600
}

CORS(app, resources={r"/api/*": cors_config})

# ===== OPTION 3: Per-Route CORS =====
from flask_cors import cross_origin

@app.route('/api/public/products', methods=['GET'])
@cross_origin()  # Allow any origin
def get_public_products():
    return jsonify(products)

@app.route('/api/products', methods=['POST'])
@cross_origin(origins=["https://app.example.com"], supports_credentials=True)
def create_product():
    # Only allow from specific origin
    return jsonify({"message": "Created"}), 201

# ===== OPTION 4: Dynamic Origin Validation =====
def validate_origin(origin):
    allowed_origins = [
        "https://app.example.com",
        "https://admin.example.com"
    ]
    return origin in allowed_origins

CORS(app, origins=validate_origin, supports_credentials=True)

# ===== OPTION 5: Environment-Based =====
import os

if os.getenv('FLASK_ENV') == 'development':
    CORS(app, origins=["http://localhost:3000"], supports_credentials=True)
else:
    CORS(app, origins=["https://app.example.com"], supports_credentials=True)
```

### Python/FastAPI CORS

```python
# main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# ===== Production Configuration =====
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://app.example.com",
        "https://admin.example.com"
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
    expose_headers=["X-Pagination"],
    max_age=600
)

# ===== Development Configuration =====
if os.getenv("ENVIRONMENT") == "development":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"]
    )
```

## Common CORS Headers

| Header | Purpose | Example |
|--------|---------|---------|
| `Access-Control-Allow-Origin` | Allowed origins | `https://app.example.com` or `*` |
| `Access-Control-Allow-Methods` | Allowed HTTP methods | `GET, POST, PUT, DELETE` |
| `Access-Control-Allow-Headers` | Allowed request headers | `Content-Type, Authorization` |
| `Access-Control-Expose-Headers` | Headers visible to frontend | `X-Pagination, X-Total-Count` |
| `Access-Control-Allow-Credentials` | Allow cookies/auth | `true` |
| `Access-Control-Max-Age` | Preflight cache duration | `600` (seconds) |

## Security Best Practices

### ✅ Do's

1. **Whitelist specific origins** in production
   ```javascript
   origin: ['https://app.example.com']
   ```

2. **Use environment variables** for origins
   ```javascript
   origin: process.env.ALLOWED_ORIGINS.split(',')
   ```

3. **Validate origins dynamically** for subdomains
   ```javascript
   origin: (origin, callback) => {
     if (/^https:\/\/.*\.example\.com$/.test(origin)) {
       callback(null, true);
     } else {
       callback(new Error('Not allowed'));
     }
   }
   ```

4. **Restrict methods** to only what's needed
   ```javascript
   methods: ['GET', 'POST'] // Don't allow DELETE if not needed
   ```

5. **Limit headers**
   ```javascript
   allowedHeaders: ['Content-Type', 'Authorization']
   ```

6. **Use credentials carefully**
   ```javascript
   credentials: true // Only if you need cookies/auth
   ```

### ❌ Don'ts

1. **Never use `*` with credentials**
   ```javascript
   // INSECURE - browsers will reject this
   origin: '*',
   credentials: true
   ```

2. **Avoid `*` in production**
   ```javascript
   // INSECURE - allows any website to call your API
   origin: '*'
   ```

3. **Don't trust Origin header blindly**
   ```javascript
   // Validate against whitelist, not just echo back
   ```

4. **Don't allow all methods**
   ```javascript
   // INSECURE - exposes dangerous methods
   methods: '*'
   ```

## Troubleshooting CORS Errors

### Browser Console Error
```
Access to fetch at 'https://api.example.com/products' from origin
'https://app.example.com' has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

### Solutions

1. **Check origin is whitelisted**
   - Verify origin exactly matches (including protocol, subdomain, port)
   - `http://localhost:3000` ≠ `http://localhost:3001`

2. **Check CORS middleware order**
   - CORS must be before authentication/authorization
   - In .NET: `UseCors()` before `UseAuthorization()`

3. **Check preflight response**
   - Server must respond to OPTIONS requests with 200
   - Include all required CORS headers in preflight

4. **Check credentials**
   - If using `credentials: true` in fetch, server must allow credentials
   - Cannot use `*` for origin when credentials are enabled

5. **Check headers**
   - Custom headers must be in `Access-Control-Allow-Headers`

## Testing CORS

### Using curl
```bash
# Preflight request
curl -X OPTIONS https://api.example.com/products \
  -H "Origin: https://app.example.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type, Authorization" \
  -v

# Actual request
curl -X POST https://api.example.com/products \
  -H "Origin: https://app.example.com" \
  -H "Content-Type: application/json" \
  -d '{"name": "Product"}' \
  -v
```

### Frontend (JavaScript)
```javascript
// Test with credentials
fetch('https://api.example.com/products', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer token'
  },
  credentials: 'include', // Send cookies
  body: JSON.stringify({ name: 'Product' })
})
.then(response => response.json())
.then(data => console.log('Success:', data))
.catch(error => console.error('CORS Error:', error));
```

## Production Checklist

- [ ] Whitelist specific origins (no `*`)
- [ ] Use HTTPS for all origins
- [ ] Restrict HTTP methods to needed ones
- [ ] Limit allowed headers
- [ ] Set preflight cache (`maxAge`)
- [ ] Use credentials only if needed
- [ ] Test in actual browsers (not just Postman)
- [ ] Monitor for CORS errors in logs
- [ ] Document allowed origins in README
