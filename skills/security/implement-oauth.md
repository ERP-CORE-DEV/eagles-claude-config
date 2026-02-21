---
name: implement-oauth
description: Integrate OAuth 2.0 / OpenID Connect authentication with Microsoft Entra ID (Azure AD) for enterprise SSO
argument-hint: "[provider] [scopes]"
tags: [security, oauth, sso, azure-ad, authentication]
---

# Implement OAuth 2.0 Authentication

Integrates OAuth 2.0 / OpenID Connect for Single Sign-On (SSO) with Microsoft Entra ID (formerly Azure AD), supporting enterprise authentication for French HR systems.

## When to Use

✅ **Use OAuth when:**
- Integrating with Microsoft 365 (common in French enterprises)
- Implementing Single Sign-On (SSO) across multiple applications
- Need to access external APIs (Microsoft Graph, Google Workspace)
- French HR context: Integration with Office 365, Teams, SharePoint
- Want to delegate authentication to identity providers

❌ **Avoid OAuth when:**
- Building simple internal apps (JWT may be simpler)
- No external identity provider integration needed
- Users don't have corporate Microsoft/Google accounts

## OAuth 2.0 Flows

| Flow | Use Case | Security |
|------|----------|----------|
| **Authorization Code + PKCE** | Web apps, SPAs | ✅ Most secure |
| **Client Credentials** | Service-to-service | ✅ Secure (no user) |
| **Implicit** | Legacy SPAs | ❌ Deprecated |
| **Resource Owner Password** | Migration only | ❌ Avoid |

## Implementation

### .NET 8 (ASP.NET Core with Microsoft Entra ID)

**1. Install packages:**
```bash
dotnet add package Microsoft.Identity.Web --version 2.15.0
dotnet add package Microsoft.Identity.Web.MicrosoftGraph --version 2.15.0
```

**2. Configure in appsettings.json:**
```json
{
  "AzureAd": {
    "Instance": "https://login.microsoftonline.com/",
    "TenantId": "${AZURE_TENANT_ID}",
    "ClientId": "${AZURE_CLIENT_ID}",
    "ClientSecret": "${AZURE_CLIENT_SECRET}",
    "CallbackPath": "/signin-oidc",
    "SignedOutCallbackPath": "/signout-callback-oidc"
  },
  "DownstreamApi": {
    "BaseUrl": "https://graph.microsoft.com/v1.0",
    "Scopes": "user.read"
  }
}
```

**3. Program.cs Configuration:**
```csharp
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.Identity.Web;

var builder = WebApplication.CreateBuilder(args);

// Add Microsoft Entra ID authentication
builder.Services.AddAuthentication(OpenIdConnectDefaults.AuthenticationScheme)
    .AddMicrosoftIdentityWebApp(builder.Configuration.GetSection("AzureAd"))
    .EnableTokenAcquisitionToCallDownstreamApi()
    .AddMicrosoftGraph(builder.Configuration.GetSection("DownstreamApi"))
    .AddInMemoryTokenCaches();

builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = options.DefaultPolicy; // Require auth by default
});

builder.Services.AddControllers();

var app = builder.Build();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.Run();
```

**4. Controller Usage:**
```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Graph;
using Microsoft.Identity.Web;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class ProfileController : ControllerBase
{
    private readonly GraphServiceClient _graphClient;

    public ProfileController(GraphServiceClient graphClient)
    {
        _graphClient = graphClient;
    }

    [HttpGet("me")]
    public async Task<IActionResult> GetMyProfile()
    {
        try
        {
            // Get user profile from Microsoft Graph
            var user = await _graphClient.Me
                .Request()
                .Select(u => new
                {
                    u.DisplayName,
                    u.Mail,
                    u.JobTitle,
                    u.Department,
                    u.OfficeLocation
                })
                .GetAsync();

            return Ok(new
            {
                displayName = user.DisplayName,
                email = user.Mail,
                jobTitle = user.JobTitle,
                department = user.Department,
                office = user.OfficeLocation
            });
        }
        catch (ServiceException ex)
        {
            return StatusCode(500, new { message = "Erreur lors de la récupération du profil", error = ex.Message });
        }
    }

    [HttpGet("photo")]
    public async Task<IActionResult> GetMyPhoto()
    {
        try
        {
            var photoStream = await _graphClient.Me.Photo.Content
                .Request()
                .GetAsync();

            return File(photoStream, "image/jpeg");
        }
        catch (ServiceException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return NotFound(new { message = "Photo non disponible" });
        }
    }
}
```

**5. Frontend Login (React):**
```typescript
// Using MSAL.js for browser
import { PublicClientApplication } from '@azure/msal-browser';

const msalConfig = {
  auth: {
    clientId: process.env.REACT_APP_AZURE_CLIENT_ID!,
    authority: `https://login.microsoftonline.com/${process.env.REACT_APP_AZURE_TENANT_ID}`,
    redirectUri: window.location.origin
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false
  }
};

const msalInstance = new PublicClientApplication(msalConfig);

// Initialize
await msalInstance.initialize();

// Login
const loginRequest = {
  scopes: ['user.read', 'openid', 'profile']
};

try {
  const loginResponse = await msalInstance.loginPopup(loginRequest);
  console.log('ID Token:', loginResponse.idToken);
  console.log('Access Token:', loginResponse.accessToken);
} catch (error) {
  console.error('Login failed:', error);
}

// Get token silently
const account = msalInstance.getAllAccounts()[0];
const tokenRequest = {
  scopes: ['user.read'],
  account: account
};

const tokenResponse = await msalInstance.acquireTokenSilent(tokenRequest);
const accessToken = tokenResponse.accessToken;
```

### Node.js/TypeScript (Express with Passport.js)

**1. Install packages:**
```bash
npm install passport passport-azure-ad express-session
npm install --save-dev @types/passport @types/express-session
```

**2. Configure Passport Strategy:**
```typescript
// auth/azureAdStrategy.ts
import passport from 'passport';
import { OIDCStrategy, IOIDCStrategyOptionWithRequest, IProfile } from 'passport-azure-ad';

const azureAdConfig = {
  identityMetadata: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/v2.0/.well-known/openid-configuration`,
  clientID: process.env.AZURE_CLIENT_ID!,
  clientSecret: process.env.AZURE_CLIENT_SECRET!,
  responseType: 'code id_token',
  responseMode: 'form_post',
  redirectUrl: `${process.env.APP_URL}/auth/callback`,
  allowHttpForRedirectUrl: process.env.NODE_ENV === 'development',
  passReqToCallback: true,
  scope: ['profile', 'email', 'openid']
};

passport.use(new OIDCStrategy(
  azureAdConfig as IOIDCStrategyOptionWithRequest,
  (req, iss, sub, profile: IProfile, accessToken, refreshToken, done) => {
    // Store user in session or database
    const user = {
      id: profile.oid, // Azure AD Object ID
      email: profile._json.email || profile.upn,
      displayName: profile.displayName,
      firstName: profile.name?.givenName,
      lastName: profile.name?.familyName,
      jobTitle: profile._json.jobTitle,
      department: profile._json.department
    };

    return done(null, user);
  }
));

passport.serializeUser((user: any, done) => {
  done(null, user);
});

passport.deserializeUser((user: any, done) => {
  done(null, user);
});

export default passport;
```

**3. Setup Routes:**
```typescript
// routes/auth.ts
import express from 'express';
import passport from '../auth/azureAdStrategy';

const router = express.Router();

// Initiate OAuth flow
router.get('/login',
  passport.authenticate('azuread-openidconnect', {
    failureRedirect: '/login-failed'
  })
);

// OAuth callback
router.post('/callback',
  passport.authenticate('azuread-openidconnect', {
    failureRedirect: '/login-failed'
  }),
  (req, res) => {
    res.redirect('/dashboard');
  }
);

// Logout
router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).send('Logout failed');
    res.redirect('/');
  });
});

export default router;
```

**4. Protected Route Middleware:**
```typescript
// middleware/ensureAuthenticated.ts
import { Request, Response, NextFunction } from 'express';

export const ensureAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/auth/login');
};

// Usage in routes
import { ensureAuthenticated } from '../middleware/ensureAuthenticated';

router.get('/api/candidates', ensureAuthenticated, async (req, res) => {
  // Protected route
  res.json({ user: req.user });
});
```

## Azure AD Application Registration

**1. Register application in Azure Portal:**
- Navigate to **Azure Active Directory** > **App registrations** > **New registration**
- Name: `RH-OptimERP-Sourcing`
- Supported account types: **Accounts in this organizational directory only**
- Redirect URI: `https://your-app.com/signin-oidc` (Web)

**2. Configure API Permissions:**
- Add **Microsoft Graph** permissions:
  - `User.Read` (Delegated)
  - `User.ReadBasic.All` (Delegated)
  - `Directory.Read.All` (Application - admin consent required)

**3. Create Client Secret:**
- Go to **Certificates & secrets** > **New client secret**
- Store securely in Azure Key Vault or environment variables

**4. Configure Token Configuration (optional claims):**
Add `email`, `family_name`, `given_name` to ID tokens

## French HR Compliance

**CNIL Requirements:**
- Azure AD is GDPR-compliant (Microsoft is a data processor)
- Must sign Data Processing Agreement (DPA) with Microsoft
- User consent required for profile data access
- Audit logs must track OAuth token usage

**Best Practices:**
```csharp
// ✅ GOOD: Request minimal scopes
var scopes = new[] { "user.read" }; // Only basic profile

// ❌ BAD: Over-requesting scopes
var scopes = new[] { "user.read", "mail.read", "files.readwrite.all" }; // Too broad!
```

## Testing

```csharp
[Fact]
public async Task GetProfile_WithValidToken_ReturnsUserInfo()
{
    // Arrange
    var mockGraphClient = new Mock<GraphServiceClient>();
    mockGraphClient.Setup(x => x.Me.Request().GetAsync())
        .ReturnsAsync(new User
        {
            DisplayName = "Jean Dupont",
            Mail = "jean.dupont@company.fr",
            JobTitle = "Chargé de Recrutement"
        });

    var controller = new ProfileController(mockGraphClient.Object);

    // Act
    var result = await controller.GetMyProfile();

    // Assert
    var okResult = Assert.IsType<OkObjectResult>(result);
    Assert.NotNull(okResult.Value);
}
```

## Related Skills

- `/implement-jwt-auth` - Add JWT authentication
- `/add-role-based-auth` - Add role-based authorization
- `/setup-azure-key-vault` - Securely store client secrets
