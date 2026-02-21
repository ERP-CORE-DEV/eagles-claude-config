---
name: implement-auth
description: Implement authentication system with JWT tokens, refresh tokens, and secure password handling
argument-hint: [type: jwt|oauth|saml|apikey] [stack: dotnet|node|python|java]
---

# Implement Authentication

Create secure authentication system with modern best practices.

## Authentication Methods

### JWT (JSON Web Tokens)
- Stateless authentication
- Access + refresh token pattern
- Claims-based authorization
- Token expiration and renewal

### OAuth 2.0 / OpenID Connect
- Social login (Google, Microsoft, GitHub)
- Authorization code flow with PKCE
- Client credentials for M2M

### SAML
- Enterprise SSO
- Federation with Active Directory

### API Keys
- Simple service-to-service auth
- Rate limiting per key

## What This Skill Generates

1. **Login endpoint** with credentials validation
2. **Token generation** (access + refresh)
3. **Token validation middleware**
4. **Token refresh endpoint**
5. **Password hashing** (bcrypt/Argon2)
6. **Logout/revocation** logic
7. **Rate limiting** for login attempts

## .NET 8 JWT Implementation

```csharp
// Program.cs configuration
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:SecretKey"]))
        };
    });

// Auth service
public class AuthService : IAuthService
{
    private readonly IUserRepository _userRepo;
    private readonly IConfiguration _config;

    public async Task<AuthResponse> LoginAsync(LoginRequest request)
    {
        var user = await _userRepo.GetByEmailAsync(request.Email);
        if (user == null || !VerifyPassword(request.Password, user.PasswordHash))
        {
            throw new UnauthorizedException("Invalid credentials");
        }

        var accessToken = GenerateAccessToken(user);
        var refreshToken = GenerateRefreshToken();

        user.RefreshToken = refreshToken;
        user.RefreshTokenExpiry = DateTime.UtcNow.AddDays(7);
        await _userRepo.UpdateAsync(user);

        return new AuthResponse
        {
            AccessToken = accessToken,
            RefreshToken = refreshToken,
            ExpiresIn = 3600
        };
    }

    private string GenerateAccessToken(User user)
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Role, user.Role)
        };

        var key = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(_config["Jwt:SecretKey"]));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"],
            audience: _config["Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddHours(1),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private bool VerifyPassword(string password, string hash)
    {
        return BCrypt.Net.BCrypt.Verify(password, hash);
    }
}

// Controller
[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;

    [HttpPost("login")]
    [ProducesResponseType(typeof(AuthResponse), 200)]
    [ProducesResponseType(401)]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        try
        {
            var response = await _authService.LoginAsync(request);
            return Ok(response);
        }
        catch (UnauthorizedException)
        {
            return Unauthorized(new { error = "Invalid credentials" });
        }
    }

    [HttpPost("refresh")]
    public async Task<IActionResult> RefreshToken([FromBody] RefreshTokenRequest request)
    {
        var response = await _authService.RefreshTokenAsync(request.RefreshToken);
        return Ok(response);
    }

    [HttpPost("logout")]
    [Authorize]
    public async Task<IActionResult> Logout()
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        await _authService.LogoutAsync(Guid.Parse(userId));
        return NoContent();
    }
}
```

## Node.js/Express JWT Implementation

```javascript
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

// Login route
router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user || !await bcrypt.compare(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const accessToken = jwt.sign(
    { userId: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  const refreshToken = crypto.randomBytes(64).toString('hex');
  user.refreshToken = refreshToken;
  user.refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await user.save();

  res.json({ accessToken, refreshToken, expiresIn: 3600 });
});

// Auth middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// Protected route
router.get('/profile', authenticateToken, async (req, res) => {
  const user = await User.findById(req.user.userId);
  res.json(user);
});
```

## Security Best Practices

1. **Password Storage**
   - Use bcrypt or Argon2 (never MD5/SHA1)
   - Minimum 10 bcrypt rounds
   - Salt automatically handled

2. **Token Security**
   - Short-lived access tokens (15min-1hr)
   - Long-lived refresh tokens (7-30 days)
   - Store refresh tokens securely (database)
   - Rotate refresh tokens on use

3. **Secret Management**
   - Store JWT secret in environment variables
   - Use Azure Key Vault / AWS Secrets Manager
   - Rotate secrets periodically

4. **Rate Limiting**
   - Max 5 login attempts per 15 minutes
   - Exponential backoff after failures
   - CAPTCHA after 3 failures

5. **Additional Protections**
   - HTTPS only
   - Secure, HttpOnly cookies for tokens
   - CORS configuration
   - Token revocation list for logout
   - Multi-factor authentication (TOTP)

## Token Refresh Flow

```
1. User logs in → Receive access + refresh tokens
2. Access token expires after 1 hour
3. Frontend calls /refresh with refresh token
4. Backend validates refresh token
5. Issue new access + refresh token pair
6. Old refresh token invalidated
```
