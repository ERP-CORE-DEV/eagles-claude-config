---
name: create-migration
description: Generate database migration scripts with rollback support
argument-hint: [type: schema|data|index] [database: ef-core|flyway|liquibase|knex|prisma]
---

# Create Database Migration

Generate safe, reversible database migration scripts.

## When to Use
- Adding/modifying tables or collections
- Changing column types or constraints
- Creating or dropping indexes
- Data transformations
- Seeding initial data

## Supports
- **EF Core**: .NET migrations with Up/Down methods
- **Flyway**: Version-based SQL migrations (Java)
- **Liquibase**: XML/YAML changesets
- **Knex**: JavaScript migrations for Node.js
- **Prisma**: Schema-first migrations
- **Raw SQL**: Direct DDL scripts

## What This Skill Does
1. Generates forward migration (Up/Apply)
2. Generates rollback migration (Down/Revert)
3. Includes data preservation strategies
4. Validates no data loss
5. Tests migration on sample data
6. Checks for breaking changes
7. Adds migration to version control

## Safety Checks
- Never drop columns with data (add deprecation flag instead)
- Preserve data during type changes
- Use transactions for atomic operations
- Test rollback before applying
- Backup production before running

## Example Usage
```
User: Create a migration to add EmailVerified column to Users table using EF Core
Assistant: [Uses create-migration skill]

Generates:
public partial class AddEmailVerifiedToUsers : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<bool>(
            name: "EmailVerified",
            table: "Users",
            nullable: false,
            defaultValue: false);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "EmailVerified",
            table: "Users");
    }
}
```


## French HR Context

Database migrations in French HR systems must account for:
- **CNIL retention policies**: Migration scripts must respect data retention periods
- **DSN compliance**: Schema changes affecting DSN-reported fields require validation
- **Convention Collective**: Sector-specific fields may need migration

### CosmosDB Migration Strategy (RH-OptimERP)

CosmosDB is schema-less, but document structure changes still need migration:

```csharp
// Domain/Migrations/IMigration.cs
public interface IMigration
{
    string Id { get; }
    string Description { get; }
    int Order { get; }
    Task UpAsync(Container container, CancellationToken ct = default);
    Task DownAsync(Container container, CancellationToken ct = default);
}

// Migrations/AddContractTypeField.cs
public class AddContractTypeField : IMigration
{
    public string Id => "2025-01-15-add-contract-type";
    public string Description => "Ajouter le champ ContractType (CDI/CDD/CDIC) aux candidats";
    public int Order => 1;

    public async Task UpAsync(Container container, CancellationToken ct = default)
    {
        // Query all candidates without contractType
        var query = new QueryDefinition("SELECT * FROM c WHERE NOT IS_DEFINED(c.contractType)");
        using var iterator = container.GetItemQueryIterator<dynamic>(query);

        while (iterator.HasMoreResults)
        {
            var response = await iterator.ReadNextAsync(ct);
            foreach (var item in response)
            {
                item.contractType = "CDI"; // Default to CDI (permanent contract)
                await container.UpsertItemAsync(item, cancellationToken: ct);
            }
        }
    }

    public async Task DownAsync(Container container, CancellationToken ct = default)
    {
        // Remove contractType field (rollback)
        var query = new QueryDefinition("SELECT * FROM c WHERE IS_DEFINED(c.contractType)");
        // ... rollback logic
    }
}

// Services/MigrationRunner.cs
public class MigrationRunner
{
    private readonly Container _migrationContainer;
    private readonly ILogger<MigrationRunner> _logger;

    public async Task RunMigrationsAsync(Container targetContainer, IEnumerable<IMigration> migrations)
    {
        var applied = await GetAppliedMigrationsAsync();

        foreach (var migration in migrations.OrderBy(m => m.Order))
        {
            if (applied.Contains(migration.Id))
            {
                _logger.LogInformation("Migration deja appliquee: {Id}", migration.Id);
                continue;
            }

            _logger.LogInformation("Application migration: {Id} - {Desc}", migration.Id, migration.Description);
            await migration.UpAsync(targetContainer);
            await RecordMigrationAsync(migration.Id);
        }
    }
}
```

### SQL Server Migration (Alternative)

```bash
# Using dotnet-ef for SQL Server
dotnet ef migrations add AddContractType --context HrDbContext
dotnet ef database update
```

## Testing

```csharp
[Fact]
public async Task Migration_AddsContractTypeField()
{
    // Arrange
    var migration = new AddContractTypeField();
    var container = CreateTestContainer();

    // Insert candidate without contractType
    await container.CreateItemAsync(new { id = "1", firstName = "Jean" });

    // Act
    await migration.UpAsync(container);

    // Assert
    var updated = await container.ReadItemAsync<dynamic>("1", new PartitionKey("1"));
    Assert.Equal("CDI", (string)updated.Resource.contractType);
}
```

## Related Skills

- `/implement-change-tracking` - Track schema changes
- `/add-audit-fields` - Audit migration operations


## Note: Contexte RH Francais

Les migrations de schema dans les systemes RH francais doivent respecter les obligations legales. Avant toute migration touchant des donnees de candidats ou employes, verifier la conformite CNIL et la compatibilite DSN. Les champs de contrat de travail (CDI, CDD, CDIC) et les donnees de paie sont soumis a des regles de retention strictes.
