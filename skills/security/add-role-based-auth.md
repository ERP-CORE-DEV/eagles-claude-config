---
name: add-role-based-auth
description: Implement role-based access control (RBAC) with hierarchical permissions and French HR organizational structures
argument-hint: "[role-model] [hierarchy-depth]"
tags: [security, authorization, rbac, permissions, access-control]
---

# Add Role-Based Authorization

Implements Role-Based Access Control (RBAC) with hierarchical permissions, organizational units, and French HR-specific roles (Responsable RH, Gestionnaire de paie, etc.).

## When to Use

✅ **Use RBAC when:**
- Multiple user types with different permission levels exist
- Permissions are based on job function, not individual users
- French HR context: Organizational hierarchy (Direction, Service, Équipe)
- Need to implement "Code du travail" access restrictions
- Audit trail requires role-based action tracking

❌ **Consider alternatives when:**
- All users have identical permissions (no RBAC needed)
- Permissions are highly dynamic/contextual (use ABAC - Attribute-Based)
- Only 2-3 simple roles exist (simple boolean flags may suffice)

## Role Hierarchy Models

| Model | Use Case | Example |
|-------|----------|---------|
| **Flat Roles** | Simple systems | Admin, Employee, Guest |
| **Hierarchical** | Enterprise HR | Direction > Manager > Employee |
| **Functional** | Department-based | RH, Comptabilité, Juridique |
| **Matrix** | Multi-dimensional | Role + Department + Location |

## Implementation

### .NET 8 (ASP.NET Core)

**1. Define Roles and Permissions:**
```csharp
// Domain/Authorization/Roles.cs
namespace Sourcing.CandidateAttraction.Domain.Authorization
{
    public static class Roles
    {
        // French HR Organizational Roles
        public const string DirecteurGeneral = "Directeur Général";
        public const string DirecteurRH = "Directeur RH";
        public const string ResponsableRH = "Responsable RH";
        public const string GestionnairePaie = "Gestionnaire de Paie";
        public const string ChargéRecrutement = "Chargé de Recrutement";
        public const string Employee = "Employé";

        // System Roles
        public const string SystemAdmin = "System Administrator";
        public const string Auditor = "Auditeur";

        public static readonly Dictionary<string, int> Hierarchy = new()
        {
            { DirecteurGeneral, 100 },
            { DirecteurRH, 80 },
            { SystemAdmin, 75 },
            { ResponsableRH, 60 },
            { GestionnairePaie, 40 },
            { ChargéRecrutement, 40 },
            { Auditor, 30 },
            { Employee, 10 }
        };

        public static bool IsHigherOrEqual(string role1, string role2)
        {
            var level1 = Hierarchy.GetValueOrDefault(role1, 0);
            var level2 = Hierarchy.GetValueOrDefault(role2, 0);
            return level1 >= level2;
        }
    }

    public static class Permissions
    {
        // Candidate Management
        public const string ViewCandidates = "candidates.view";
        public const string CreateCandidates = "candidates.create";
        public const string UpdateCandidates = "candidates.update";
        public const string DeleteCandidates = "candidates.delete";
        public const string ExportCandidates = "candidates.export";

        // GDPR Operations
        public const string AnonymizeCandidates = "candidates.anonymize";
        public const string ViewAuditLogs = "audit.view";

        // Payroll (Paie)
        public const string ViewSalaryData = "payroll.view";
        public const string ProcessPayroll = "payroll.process";

        // System
        public const string ManageUsers = "system.users.manage";
        public const string ManageRoles = "system.roles.manage";
    }
}
```

**2. Role-Permission Mapping:**
```csharp
// Domain/Authorization/RolePermissions.cs
public static class RolePermissions
{
    public static readonly Dictionary<string, HashSet<string>> Mapping = new()
    {
        {
            Roles.DirecteurGeneral,
            new HashSet<string>
            {
                Permissions.ViewCandidates,
                Permissions.CreateCandidates,
                Permissions.UpdateCandidates,
                Permissions.DeleteCandidates,
                Permissions.ExportCandidates,
                Permissions.ViewSalaryData,
                Permissions.ViewAuditLogs,
                Permissions.ManageUsers,
                Permissions.ManageRoles
            }
        },
        {
            Roles.DirecteurRH,
            new HashSet<string>
            {
                Permissions.ViewCandidates,
                Permissions.CreateCandidates,
                Permissions.UpdateCandidates,
                Permissions.DeleteCandidates,
                Permissions.ViewAuditLogs,
                Permissions.ManageUsers
            }
        },
        {
            Roles.ChargéRecrutement,
            new HashSet<string>
            {
                Permissions.ViewCandidates,
                Permissions.CreateCandidates,
                Permissions.UpdateCandidates
            }
        },
        {
            Roles.GestionnairePaie,
            new HashSet<string>
            {
                Permissions.ViewSalaryData,
                Permissions.ProcessPayroll
            }
        },
        {
            Roles.Employee,
            new HashSet<string>
            {
                Permissions.ViewCandidates // Read-only
            }
        }
    };

    public static bool HasPermission(string role, string permission)
    {
        return Mapping.TryGetValue(role, out var permissions) && permissions.Contains(permission);
    }

    public static bool HasAnyPermission(IEnumerable<string> roles, string permission)
    {
        return roles.Any(role => HasPermission(role, permission));
    }
}
```

**3. Authorization Handlers:**
```csharp
// Infrastructure/Authorization/PermissionHandler.cs
using Microsoft.AspNetCore.Authorization;

public class PermissionRequirement : IAuthorizationRequirement
{
    public string Permission { get; }

    public PermissionRequirement(string permission)
    {
        Permission = permission;
    }
}

public class PermissionHandler : AuthorizationHandler<PermissionRequirement>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        PermissionRequirement requirement)
    {
        var userRoles = context.User.Claims
            .Where(c => c.Type == ClaimTypes.Role)
            .Select(c => c.Value)
            .ToList();

        if (RolePermissions.HasAnyPermission(userRoles, requirement.Permission))
        {
            context.Succeed(requirement);
        }

        return Task.CompletedTask;
    }
}
```

**4. Configure in Program.cs:**
```csharp
builder.Services.AddAuthorization(options =>
{
    // Register permission policies
    options.AddPolicy(Permissions.ViewCandidates, policy =>
        policy.Requirements.Add(new PermissionRequirement(Permissions.ViewCandidates)));

    options.AddPolicy(Permissions.CreateCandidates, policy =>
        policy.Requirements.Add(new PermissionRequirement(Permissions.CreateCandidates)));

    options.AddPolicy(Permissions.DeleteCandidates, policy =>
        policy.Requirements.Add(new PermissionRequirement(Permissions.DeleteCandidates)));

    // French HR: Separate payroll access (CNIL compliance)
    options.AddPolicy(Permissions.ViewSalaryData, policy =>
        policy.Requirements.Add(new PermissionRequirement(Permissions.ViewSalaryData)));

    // System admin only
    options.AddPolicy(Permissions.ManageRoles, policy =>
        policy.RequireRole(Roles.SystemAdmin, Roles.DirecteurGeneral));
});

builder.Services.AddSingleton<IAuthorizationHandler, PermissionHandler>();
```

**5. Use in Controllers:**
```csharp
[ApiController]
[Route("api/[controller]")]
[Authorize] // Requires authentication
public class CandidatesController : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = Permissions.ViewCandidates)]
    public async Task<IActionResult> GetCandidates()
    {
        // All authenticated users with ViewCandidates permission
        return Ok(await _service.GetCandidatesAsync());
    }

    [HttpPost]
    [Authorize(Policy = Permissions.CreateCandidates)]
    public async Task<IActionResult> CreateCandidate([FromBody] CandidateDto dto)
    {
        // Only Chargé de Recrutement and above
        return CreatedAtAction(nameof(GetCandidate),
            await _service.CreateCandidateAsync(dto));
    }

    [HttpDelete("{id}")]
    [Authorize(Policy = Permissions.DeleteCandidates)]
    public async Task<IActionResult> DeleteCandidate(string id)
    {
        // Only Directeur RH and above
        await _service.DeleteCandidateAsync(id);
        return NoContent();
    }

    [HttpPost("{id}/anonymize")]
    [Authorize(Roles = Roles.DirecteurRH)] // Role-based (not permission-based)
    public async Task<IActionResult> AnonymizeCandidate(string id)
    {
        // GDPR: Only DPO/Directeur RH can anonymize
        await _service.AnonymizeCandidateAsync(id);
        return NoContent();
    }
}
```

### Node.js/TypeScript (Express)

**1. Define Roles and Permissions:**
```typescript
// authorization/roles.ts
export enum Role {
  DIRECTEUR_GENERAL = 'Directeur Général',
  DIRECTEUR_RH = 'Directeur RH',
  RESPONSABLE_RH = 'Responsable RH',
  GESTIONNAIRE_PAIE = 'Gestionnaire de Paie',
  CHARGE_RECRUTEMENT = 'Chargé de Recrutement',
  EMPLOYEE = 'Employé',
  SYSTEM_ADMIN = 'System Administrator'
}

export enum Permission {
  VIEW_CANDIDATES = 'candidates.view',
  CREATE_CANDIDATES = 'candidates.create',
  UPDATE_CANDIDATES = 'candidates.update',
  DELETE_CANDIDATES = 'candidates.delete',
  VIEW_SALARY = 'payroll.view',
  MANAGE_USERS = 'system.users.manage'
}

export const rolePermissions: Record<Role, Permission[]> = {
  [Role.DIRECTEUR_GENERAL]: [
    Permission.VIEW_CANDIDATES,
    Permission.CREATE_CANDIDATES,
    Permission.UPDATE_CANDIDATES,
    Permission.DELETE_CANDIDATES,
    Permission.VIEW_SALARY,
    Permission.MANAGE_USERS
  ],
  [Role.DIRECTEUR_RH]: [
    Permission.VIEW_CANDIDATES,
    Permission.CREATE_CANDIDATES,
    Permission.UPDATE_CANDIDATES,
    Permission.DELETE_CANDIDATES,
    Permission.MANAGE_USERS
  ],
  [Role.CHARGE_RECRUTEMENT]: [
    Permission.VIEW_CANDIDATES,
    Permission.CREATE_CANDIDATES,
    Permission.UPDATE_CANDIDATES
  ],
  [Role.EMPLOYEE]: [
    Permission.VIEW_CANDIDATES
  ]
};

export function hasPermission(roles: Role[], permission: Permission): boolean {
  return roles.some(role =>
    rolePermissions[role]?.includes(permission)
  );
}
```

**2. Authorization Middleware:**
```typescript
// middleware/authorize.ts
import { Response, NextFunction } from 'express';
import { AuthRequest } from './authMiddleware';
import { Permission, hasPermission } from '../authorization/roles';

export const requirePermission = (...permissions: Permission[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Non authentifié' });
    }

    const userRoles = req.user.roles;
    const hasAccess = permissions.some(permission =>
      hasPermission(userRoles, permission)
    );

    if (!hasAccess) {
      return res.status(403).json({
        message: 'Accès refusé - Permissions insuffisantes'
      });
    }

    next();
  };
};

export const requireRole = (...roles: Role[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Non authentifié' });
    }

    const hasRole = roles.some(role => req.user!.roles.includes(role));
    if (!hasRole) {
      return res.status(403).json({
        message: 'Accès refusé - Rôle insuffisant'
      });
    }

    next();
  };
};
```

**3. Use in Routes:**
```typescript
// routes/candidates.ts
import express from 'express';
import { authenticate } from '../middleware/authMiddleware';
import { requirePermission, requireRole } from '../middleware/authorize';
import { Permission, Role } from '../authorization/roles';

const router = express.Router();

router.get('/',
  authenticate,
  requirePermission(Permission.VIEW_CANDIDATES),
  async (req, res) => {
    // All users with view permission
    const candidates = await candidateService.getAll();
    res.json(candidates);
  }
);

router.post('/',
  authenticate,
  requirePermission(Permission.CREATE_CANDIDATES),
  async (req, res) => {
    // Only Chargé de Recrutement and above
    const candidate = await candidateService.create(req.body);
    res.status(201).json(candidate);
  }
);

router.delete('/:id',
  authenticate,
  requireRole(Role.DIRECTEUR_RH, Role.DIRECTEUR_GENERAL),
  async (req, res) => {
    // Only Directeur-level roles
    await candidateService.delete(req.params.id);
    res.sendStatus(204);
  }
);

export default router;
```

## French HR Compliance

**CNIL/GDPR Requirements:**
```csharp
// Separate access control for PII data
[Authorize(Policy = "ViewPersonalData")]
public async Task<IActionResult> GetCandidateNir(string id)
{
    // Only authorized RH roles can view NIR
    // Log access for audit trail
    await _auditService.LogAccessAsync(User.Identity.Name, "NIR", id);
    return Ok(await _service.GetNirAsync(id));
}
```

**Code du Travail Compliance:**
- Payroll access (données de paie) must be segregated from HR
- Medical data access requires separate role (Médecin du travail)
- Disciplinary records (dossier disciplinaire) need specific permissions

## Testing

```csharp
[Fact]
public async Task CreateCandidate_WithoutPermission_Returns403()
{
    // Arrange
    var user = CreateUserWithRole(Roles.Employee); // Employee has no create permission
    _controller.ControllerContext = CreateControllerContext(user);

    // Act
    var result = await _controller.CreateCandidate(new CandidateDto());

    // Assert
    Assert.IsType<ForbidResult>(result);
}

[Fact]
public async Task CreateCandidate_WithPermission_Returns201()
{
    // Arrange
    var user = CreateUserWithRole(Roles.ChargéRecrutement); // Has create permission
    _controller.ControllerContext = CreateControllerContext(user);

    // Act
    var result = await _controller.CreateCandidate(new CandidateDto());

    // Assert
    var createdResult = Assert.IsType<CreatedAtActionResult>(result);
    Assert.NotNull(createdResult.Value);
}
```

## Related Skills

- `/implement-jwt-auth` - Add JWT authentication
- `/implement-oauth` - Integrate OAuth 2.0 providers
- `/add-audit-logging` - Track user actions by role
