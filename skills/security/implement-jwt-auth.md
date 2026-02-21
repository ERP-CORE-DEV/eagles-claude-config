---
name: implement-jwt-auth
description: Implement JWT-based authentication with token generation, validation, and refresh mechanisms
argument-hint: "[security-level] [token-expiry]"
tags: [security, authentication, jwt, tokens, web-api]
---

# Implement JWT Authentication

Adds JSON Web Token (JWT) authentication to your application with secure token generation, validation, refresh token support, and role-based claims.

## When to Use

✅ **Use JWT when:**
- Building stateless REST APIs or microservices
- Implementing Single Sign-On (SSO) across multiple services
- Mobile/SPA applications need persistent authentication
- Horizontal scaling requires session-less architecture
- Cross-domain authentication is needed
- French HR context: CNIL-compliant identity management

❌ **Avoid JWT when:**
- Building traditional server-rendered web apps (use cookie sessions)
- Immediate token revocation is critical (JWT can't be invalidated until expiry)
- Storing large amounts of session data (JWT size limits)
- You need real-time permission changes

## Architecture Decision

| Approach | Use Case | Pros | Cons |
|----------|----------|------|------|
| **Symmetric (HS256)** | Single service | Fast, simple | Shared secret risk |
| **Asymmetric (RS256)** | Microservices, SSO | Private key isolated | Slower, complex setup |
| **Refresh Tokens** | Long sessions | Revocable, secure | Extra DB lookup |
| **Short-lived JWT** | High security | Auto-expiry | Frequent re-auth |

## Implementation

### .NET 8 (ASP.NET Core Web API)

**1. Install packages:**
```bash
dotnet add package Microsoft.AspNetCore.Authentication.JwtBearer --version 8.0.0
dotnet add package System.IdentityModel.Tokens.Jwt --version 7.0.0
```

**2. Configure JWT in Program.cs:**
```csharp
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

// JWT Configuration
var jwtSettings = builder.Configuration.GetSection("JwtSettings");
var secretKey = jwtSettings["SecretKey"] ?? throw new InvalidOperationException("JWT SecretKey not configured");
var key = Encoding.UTF8.GetBytes(secretKey);

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = true; // Enforce HTTPS
    options.SaveToken = true;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(key),
        ValidateIssuer = true,
        ValidIssuer = jwtSettings["Issuer"],
        ValidateAudience = true,
        ValidAudience = jwtSettings["Audience"],
        ValidateLifetime = true,
        ClockSkew = TimeSpan.Zero // No tolerance for expired tokens
    };
});

builder.Services.AddAuthorization();

var app = builder.Build();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.Run();
```

**3. appsettings.json:**
```json
{
  "JwtSettings": {
    "SecretKey": "${JWT_SECRET_KEY}",
    "Issuer": "RH-OptimERP",
    "Audience": "rh-optimerp-clients",
    "AccessTokenExpiryMinutes": 15,
    "RefreshTokenExpiryDays": 7
  }
}
```

**4. Token Service:**
```csharp
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.IdentityModel.Tokens;

public interface ITokenService
{
    string GenerateAccessToken(string userId, string email, IEnumerable<string> roles);
    string GenerateRefreshToken();
    ClaimsPrincipal? ValidateToken(string token);
}

public class TokenService : ITokenService
{
    private readonly IConfiguration _configuration;
    private readonly byte[] _key;

    public TokenService(IConfiguration configuration)
    {
        _configuration = configuration;
        var secretKey = configuration["JwtSettings:SecretKey"]
            ?? throw new InvalidOperationException("JWT SecretKey not configured");
        _key = Encoding.UTF8.GetBytes(secretKey);
    }

    public string GenerateAccessToken(string userId, string email, IEnumerable<string> roles)
    {
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, userId),
            new(JwtRegisteredClaimNames.Email, email),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new("user_id", userId)
        };

        // Add role claims
        claims.AddRange(roles.Select(role => new Claim(ClaimTypes.Role, role)));

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = DateTime.UtcNow.AddMinutes(
                int.Parse(_configuration["JwtSettings:AccessTokenExpiryMinutes"] ?? "15")
            ),
            Issuer = _configuration["JwtSettings:Issuer"],
            Audience = _configuration["JwtSettings:Audience"],
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(_key),
                SecurityAlgorithms.HmacSha256Signature
            )
        };

        var tokenHandler = new JwtSecurityTokenHandler();
        var token = tokenHandler.CreateToken(tokenDescriptor);
        return tokenHandler.WriteToken(token);
    }

    public string GenerateRefreshToken()
    {
        var randomNumber = new byte[64];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(randomNumber);
        return Convert.ToBase64String(randomNumber);
    }

    public ClaimsPrincipal? ValidateToken(string token)
    {
        var tokenHandler = new JwtSecurityTokenHandler();
        try
        {
            var principal = tokenHandler.ValidateToken(token, new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(_key),
                ValidateIssuer = true,
                ValidIssuer = _configuration["JwtSettings:Issuer"],
                ValidateAudience = true,
                ValidAudience = _configuration["JwtSettings:Audience"],
                ValidateLifetime = false // Don't validate expiry for refresh
            }, out _);

            return principal;
        }
        catch
        {
            return null;
        }
    }
}
```

**5. Auth Controller:**
```csharp
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly ITokenService _tokenService;
    private readonly IUserService _userService; // Your user service

    public AuthController(ITokenService tokenService, IUserService userService)
    {
        _tokenService = tokenService;
        _userService = userService;
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        // Validate credentials (use bcrypt/argon2 for password hashing)
        var user = await _userService.ValidateCredentialsAsync(request.Email, request.Password);
        if (user == null)
            return Unauthorized(new { message = "Identifiants invalides" });

        var roles = await _userService.GetUserRolesAsync(user.Id);
        var accessToken = _tokenService.GenerateAccessToken(user.Id, user.Email, roles);
        var refreshToken = _tokenService.GenerateRefreshToken();

        // Store refresh token in DB with expiry
        await _userService.StoreRefreshTokenAsync(user.Id, refreshToken,
            DateTime.UtcNow.AddDays(7));

        return Ok(new
        {
            accessToken,
            refreshToken,
            expiresIn = 900, // 15 minutes in seconds
            tokenType = "Bearer"
        });
    }

    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh([FromBody] RefreshTokenRequest request)
    {
        var principal = _tokenService.ValidateToken(request.AccessToken);
        if (principal == null)
            return Unauthorized(new { message = "Token invalide" });

        var userId = principal.FindFirst("user_id")?.Value;
        if (string.IsNullOrEmpty(userId))
            return Unauthorized();

        // Validate refresh token from DB
        var isValid = await _userService.ValidateRefreshTokenAsync(userId, request.RefreshToken);
        if (!isValid)
            return Unauthorized(new { message = "Refresh token invalide ou expiré" });

        var user = await _userService.GetUserByIdAsync(userId);
        var roles = await _userService.GetUserRolesAsync(userId);

        var newAccessToken = _tokenService.GenerateAccessToken(user.Id, user.Email, roles);
        var newRefreshToken = _tokenService.GenerateRefreshToken();

        // Rotate refresh token
        await _userService.ReplaceRefreshTokenAsync(userId, request.RefreshToken,
            newRefreshToken, DateTime.UtcNow.AddDays(7));

        return Ok(new
        {
            accessToken = newAccessToken,
            refreshToken = newRefreshToken,
            expiresIn = 900
        });
    }
}

public record LoginRequest(string Email, string Password);
public record RefreshTokenRequest(string AccessToken, string RefreshToken);
```

### Node.js/TypeScript (Express)

**1. Install packages:**
```bash
npm install jsonwebtoken bcrypt
npm install --save-dev @types/jsonwebtoken @types/bcrypt
```

**2. Token Service (tokenService.ts):**
```typescript
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

interface TokenPayload {
  userId: string;
  email: string;
  roles: string[];
}

export class TokenService {
  private readonly secretKey: string;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly accessTokenExpiry: string;

  constructor() {
    this.secretKey = process.env.JWT_SECRET_KEY || '';
    this.issuer = 'RH-OptimERP';
    this.audience = 'rh-optimerp-clients';
    this.accessTokenExpiry = '15m';

    if (!this.secretKey) {
      throw new Error('JWT_SECRET_KEY must be defined');
    }
  }

  generateAccessToken(userId: string, email: string, roles: string[]): string {
    const payload: TokenPayload = { userId, email, roles };

    return jwt.sign(payload, this.secretKey, {
      expiresIn: this.accessTokenExpiry,
      issuer: this.issuer,
      audience: this.audience,
      subject: userId
    });
  }

  generateRefreshToken(): string {
    return crypto.randomBytes(64).toString('base64url');
  }

  verifyToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.secretKey, {
        issuer: this.issuer,
        audience: this.audience
      }) as TokenPayload;
      return decoded;
    } catch (error) {
      return null;
    }
  }
}
```

**3. Auth Middleware (authMiddleware.ts):**
```typescript
import { Request, Response, NextFunction } from 'express';
import { TokenService } from './tokenService';

const tokenService = new TokenService();

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    roles: string[];
  };
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token manquant' });
  }

  const token = authHeader.substring(7);
  const payload = tokenService.verifyToken(token);

  if (!payload) {
    return res.status(401).json({ message: 'Token invalide ou expiré' });
  }

  req.user = payload;
  next();
};

export const requireRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Non authentifié' });
    }

    const hasRole = roles.some(role => req.user!.roles.includes(role));
    if (!hasRole) {
      return res.status(403).json({ message: 'Accès refusé' });
    }

    next();
  };
};
```

## French HR Compliance

**CNIL Requirements:**
- ✅ JWT tokens must NOT contain PII (NIR, salary, health data)
- ✅ Use user_id references instead of storing sensitive data in tokens
- ✅ Implement token expiry (max 30 days for refresh tokens)
- ✅ Log authentication attempts for audit trail
- ✅ Use HTTPS only (no HTTP transmission of tokens)

**Best Practices:**
```csharp
// ❌ BAD: Storing NIR in JWT
var claims = new[]
{
    new Claim("nir", user.Nir) // CNIL violation!
};

// ✅ GOOD: Reference only
var claims = new[]
{
    new Claim("user_id", user.Id),
    new Claim(ClaimTypes.Role, user.Role)
};
```

## Security Considerations

| Risk | Mitigation |
|------|------------|
| **Token theft** | Short expiry (15 min), HTTPS only, HttpOnly cookies for refresh tokens |
| **XSS attacks** | Store tokens in memory/sessionStorage, never localStorage |
| **CSRF** | Use SameSite cookies, CSRF tokens for state-changing operations |
| **Replay attacks** | Add `jti` (JWT ID) claim, track used tokens |
| **Key compromise** | Rotate keys regularly, use asymmetric keys for distributed systems |

## Testing

```csharp
[Fact]
public void GenerateAccessToken_ValidUser_ReturnsValidJwt()
{
    // Arrange
    var tokenService = new TokenService(_configuration);
    var userId = "user123";
    var email = "user@company.fr";
    var roles = new[] { "Employee", "Manager" };

    // Act
    var token = tokenService.GenerateAccessToken(userId, email, roles);
    var handler = new JwtSecurityTokenHandler();
    var jwtToken = handler.ReadJwtToken(token);

    // Assert
    Assert.Equal(userId, jwtToken.Subject);
    Assert.Contains(jwtToken.Claims, c => c.Type == ClaimTypes.Role && c.Value == "Manager");
}
```

## Related Skills

- `/add-role-based-auth` - Add role-based authorization
- `/implement-oauth` - Integrate OAuth 2.0 providers
- `/add-data-encryption` - Encrypt sensitive data at rest
