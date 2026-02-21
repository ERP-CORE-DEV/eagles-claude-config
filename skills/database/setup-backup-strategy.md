---
name: setup-backup-strategy
description: Implement backup and disaster recovery strategy for Azure CosmosDB with CNIL-compliant data retention policies
argument-hint: "[rto-minutes] [rpo-minutes]"
tags: [database, backup, disaster-recovery, azure, cosmos-db, compliance]
---

# Setup Backup Strategy

Implements comprehensive backup and disaster recovery for Azure CosmosDB with point-in-time restore, geo-replication, and French CNIL data retention compliance.

## When to Use

**Use backup strategy when:**
- Production deployment with real user data
- CNIL/GDPR compliance requires data protection
- Business continuity requirements (RTO/RPO targets)
- French HR: Payroll data (5-year retention), social security records
- Multi-region availability needed (France + DR region)

**Key Metrics:**
- **RTO** (Recovery Time Objective): Max acceptable downtime
- **RPO** (Recovery Point Objective): Max acceptable data loss

| Tier | RTO | RPO | Strategy |
|------|-----|-----|----------|
| **Tier 1** (Payroll) | < 1 hour | < 5 minutes | Continuous backup + geo-replication |
| **Tier 2** (HR Data) | < 4 hours | < 1 hour | Continuous backup |
| **Tier 3** (Analytics) | < 24 hours | < 4 hours | Periodic backup |

## Implementation

### Azure CosmosDB Backup Configuration

**1. Continuous Backup (Recommended for HR data):**
```bash
# Create CosmosDB account with continuous backup
az cosmosdb create \
  --name cosmosdb-sourcing-candidate-attraction-core \
  --resource-group rg-sourcing-and-candidate-attraction \
  --locations regionName=westeurope failoverPriority=0 \
  --locations regionName=northeurope failoverPriority=1 \
  --backup-policy-type Continuous \
  --continuous-tier Continuous30Days \
  --default-consistency-level Session \
  --enable-automatic-failover true
```

**2. Point-in-Time Restore:**
```bash
# Restore to a specific timestamp
az cosmosdb restore \
  --target-database-account-name cosmosdb-sourcing-restored \
  --account-name cosmosdb-sourcing-candidate-attraction-core \
  --resource-group rg-sourcing-and-candidate-attraction \
  --restore-timestamp "2025-01-15T10:30:00Z" \
  --location westeurope

# Restore specific databases/containers
az cosmosdb restore \
  --target-database-account-name cosmosdb-sourcing-restored \
  --account-name cosmosdb-sourcing-candidate-attraction-core \
  --resource-group rg-sourcing-and-candidate-attraction \
  --restore-timestamp "2025-01-15T10:30:00Z" \
  --databases-to-restore name=SourcingCandidateAttraction collections=Candidates collections=JobPostings
```

**3. Geo-Replication (Multi-Region):**
```bash
# Add read region for DR
az cosmosdb update \
  --name cosmosdb-sourcing-candidate-attraction-core \
  --resource-group rg-sourcing-and-candidate-attraction \
  --locations regionName=westeurope failoverPriority=0 \
  --locations regionName=northeurope failoverPriority=1 \
  --enable-automatic-failover true

# Manual failover (for planned maintenance)
az cosmosdb failover-priority-change \
  --name cosmosdb-sourcing-candidate-attraction-core \
  --resource-group rg-sourcing-and-candidate-attraction \
  --failover-policies northeurope=0 westeurope=1
```

### .NET 8 (Backup Health Check)

```csharp
// Infrastructure/HealthChecks/BackupHealthCheck.cs
using Microsoft.Extensions.Diagnostics.HealthChecks;

public class CosmosBackupHealthCheck : IHealthCheck
{
    private readonly CosmosClient _client;
    private readonly IConfiguration _config;

    public CosmosBackupHealthCheck(CosmosClient client, IConfiguration config)
    {
        _client = client;
        _config = config;
    }

    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var account = await _client.ReadAccountAsync();

            // Check if multi-region is configured
            var regions = account.ReadableRegions.ToList();
            if (regions.Count < 2)
            {
                return HealthCheckResult.Degraded(
                    "CosmosDB has only 1 region. DR requires 2+ regions.",
                    data: new Dictionary<string, object>
                    {
                        { "regions", regions.Select(r => r.Name).ToList() },
                        { "consistency", account.ConsistencyPolicy.DefaultConsistencyLevel.ToString() }
                    });
            }

            return HealthCheckResult.Healthy(
                $"CosmosDB backup healthy. Regions: {string.Join(", ", regions.Select(r => r.Name))}",
                data: new Dictionary<string, object>
                {
                    { "regions", regions.Select(r => r.Name).ToList() },
                    { "automaticFailover", true }
                });
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Unhealthy("CosmosDB backup check failed", ex);
        }
    }
}

// Register in Program.cs
builder.Services.AddHealthChecks()
    .AddCheck<CosmosBackupHealthCheck>("cosmos-backup", tags: new[] { "backup", "dr" });
```

### Automated Backup Testing

```csharp
// Infrastructure/BackupTesting/BackupTestService.cs
public class BackupTestService : IHostedService
{
    private Timer? _timer;
    private readonly ILogger<BackupTestService> _logger;

    public Task StartAsync(CancellationToken cancellationToken)
    {
        // Run backup test monthly
        _timer = new Timer(RunBackupTest, null, TimeSpan.Zero, TimeSpan.FromDays(30));
        return Task.CompletedTask;
    }

    private async void RunBackupTest(object? state)
    {
        _logger.LogInformation("Starting monthly backup test...");

        try
        {
            // 1. Verify backup exists
            // 2. Restore to test account
            // 3. Verify data integrity
            // 4. Compare record counts
            // 5. Report results

            _logger.LogInformation("Backup test passed");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "BACKUP TEST FAILED - Immediate action required");
            // Send alert to ops team
        }
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        _timer?.Dispose();
        return Task.CompletedTask;
    }
}
```

### Terraform Configuration

```hcl
# infrastructure/terraform/cosmosdb.tf
resource "azurerm_cosmosdb_account" "main" {
  name                      = "cosmosdb-sourcing-candidate-attraction-core"
  location                  = "West Europe"
  resource_group_name       = azurerm_resource_group.main.name
  offer_type                = "Standard"
  kind                      = "GlobalDocumentDB"
  enable_automatic_failover = true

  consistency_policy {
    consistency_level = "Session"
  }

  # Primary region (France)
  geo_location {
    location          = "westeurope"
    failover_priority = 0
  }

  # DR region (North Europe)
  geo_location {
    location          = "northeurope"
    failover_priority = 1
  }

  backup {
    type                = "Continuous"
    tier                = "Continuous30Days"
    storage_redundancy  = "Geo"
  }

  tags = {
    environment = "production"
    project     = "rh-optimerp"
    microservice = "sourcing-candidate-attraction"
    compliance  = "cnil-gdpr"
  }
}
```

## French CNIL Data Retention Policies

```csharp
// Domain/Compliance/RetentionPolicies.cs
public static class RetentionPolicies
{
    // French legal requirements
    public static readonly TimeSpan PayrollData = TimeSpan.FromDays(365 * 5);       // 5 years (Code du travail L3243-4)
    public static readonly TimeSpan SocialSecurity = TimeSpan.FromDays(365 * 5);    // 5 years
    public static readonly TimeSpan TimeAttendance = TimeSpan.FromDays(365);         // 1 year
    public static readonly TimeSpan RecruitmentData = TimeSpan.FromDays(365 * 2);   // 2 years (CNIL recommendation)
    public static readonly TimeSpan MedicalRecords = TimeSpan.FromDays(365 * 50);   // 50 years
    public static readonly TimeSpan DisciplinaryRecords = TimeSpan.FromDays(365 * 3); // 3 years
    public static readonly TimeSpan AuditLogs = TimeSpan.FromDays(365 * 6);         // 6 years (fiscal requirement)
    public static readonly TimeSpan BackupRetention = TimeSpan.FromDays(30);         // 30 days (continuous backup)

    // Validate retention compliance
    public static bool IsRetentionCompliant(string dataCategory, DateTime createdAt)
    {
        var retention = dataCategory switch
        {
            "payroll" => PayrollData,
            "social_security" => SocialSecurity,
            "time_attendance" => TimeAttendance,
            "recruitment" => RecruitmentData,
            "medical" => MedicalRecords,
            "disciplinary" => DisciplinaryRecords,
            _ => TimeSpan.FromDays(365 * 2) // Default: 2 years
        };

        return DateTime.UtcNow - createdAt <= retention;
    }
}
```

## Disaster Recovery Runbook

1. **Detection**: Azure Monitor alerts on CosmosDB availability drop
2. **Assessment**: Check Azure Service Health dashboard
3. **Decision**: Automatic failover or manual intervention
4. **Recovery**: Point-in-time restore if data corruption detected
5. **Validation**: Run data integrity checks on restored data
6. **Communication**: Notify affected teams and update status page

## Testing

```csharp
[Fact]
public void RetentionPolicy_PayrollData_5Years()
{
    var createdAt = DateTime.UtcNow.AddYears(-4); // 4 years ago
    Assert.True(RetentionPolicies.IsRetentionCompliant("payroll", createdAt));
}

[Fact]
public void RetentionPolicy_RecruitmentData_Expired()
{
    var createdAt = DateTime.UtcNow.AddYears(-3); // 3 years ago (exceeds 2-year limit)
    Assert.False(RetentionPolicies.IsRetentionCompliant("recruitment", createdAt));
}

[Fact]
public async Task BackupHealthCheck_MultiRegion_ReturnsHealthy()
{
    var check = new CosmosBackupHealthCheck(_mockClient, _config);
    var result = await check.CheckHealthAsync(new HealthCheckContext());

    Assert.Equal(HealthStatus.Healthy, result.Status);
}
```

## Related Skills

- `/add-audit-fields` - Track data modifications
- `/implement-change-tracking` - Change data capture
- `/setup-kubernetes` - AKS deployment with DR
