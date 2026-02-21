---
name: schema-design
description: Design database schema with best practices for normalization, indexing, and relationships
argument-hint: [database-type: cosmos|postgres|mongodb|sqlserver|mysql]
---

# Database Schema Design

Design and validate database schemas following industry best practices.

## When to Use
- Starting a new database design
- Reviewing existing schema for optimization
- Planning data model for a new feature
- Migrating between database types

## Supports
- **CosmosDB**: Document-based with partition keys
- **PostgreSQL**: Relational with JSONB support
- **MongoDB**: Document collections with indexes
- **SQL Server**: Enterprise relational patterns
- **MySQL**: Standard relational design

## What This Skill Does
1. Analyzes requirements to determine entity relationships
2. Applies normalization (1NF, 2NF, 3NF) principles
3. Designs indexes for query performance
4. Plans partition strategies for scale
5. Validates foreign key constraints
6. Recommends data types for each field
7. Identifies potential bottlenecks

## Output
- Entity-Relationship diagram
- Table/collection definitions with fields
- Index recommendations
- Partition key strategy (NoSQL)
- Migration scripts ready to execute

## Example Usage
```
User: Design a schema for an HR employee management system using CosmosDB
Assistant: [Uses schema-design skill with cosmos parameter]
- Creates Employee container (partition key: /departmentId)
- Embeds address/contact as sub-documents
- Separate containers for large arrays (certifications, training history)
- Composite indexes for common queries (lastName + hireDate)
```

## Best Practices Applied
- Normalize relational data to 3NF minimum
- Denormalize NoSQL for query efficiency
- Index foreign keys and query filters
- Use appropriate data types (UUID vs INT, DateTime vs Unix timestamp)
- Plan for soft deletes (isDeleted flag)
- Include audit fields (createdAt, updatedAt, createdBy)
- GDPR compliance fields (isAnonymized, anonymizedAt)


## French HR Context

CosmosDB schema design for French HR systems must balance:
- **Denormalization** (embed frequently accessed data)
- **CNIL compliance** (separate sensitive data)
- **Query patterns** (optimize for common access patterns)

### RH-OptimERP Document Design

```json
// Candidate document (main container)
{
  "id": "candidate-123",
  "partitionKey": "company-abc",
  "firstName": "Jean",
  "lastName": "Dupont",
  "email": "jean.dupont@example.fr",
  "phone": "+33612345678",
  "contractType": "CDI",
  "skills": ["React", "TypeScript", ".NET 8"],
  "experience": [
    {
      "company": "TechCorp",
      "position": "Developpeur Senior",
      "startDate": "2020-01-15",
      "endDate": null,
      "durationMonths": 60
    }
  ],
  "education": [
    {
      "institution": "Ecole Polytechnique",
      "degree": "Ingenieur",
      "year": 2019
    }
  ],
  "address": {
    "city": "Paris",
    "postalCode": "75001",
    "department": "75"
  },
  "matchingScore": 0.87,
  "createdAt": "2025-01-15T10:30:00Z",
  "createdBy": "recruiter-456",
  "updatedAt": null,
  "isAnonymized": false,
  "isDeleted": false
}

// Sensitive data (separate container - CNIL compliance)
{
  "id": "sensitive-candidate-123",
  "partitionKey": "candidate-123",
  "nirEncrypted": "base64-encrypted-nir",
  "salaryExpectationEncrypted": "base64-encrypted-salary",
  "healthInfoEncrypted": null,
  "accessLog": [
    {
      "userId": "rh-director-789",
      "accessedAt": "2025-01-15T14:00:00Z",
      "reason": "Verification embauche"
    }
  ]
}
```

### Partition Key Strategy

| Container | Partition Key | Reasoning |
|-----------|--------------|-----------|
| Candidates | companyId | Group by employer for multi-tenant |
| JobPostings | companyId | Same as candidates for cross-queries |
| SensitiveData | candidateId | Isolate for CNIL access control |
| ChangeLogs | entityId | Group changes per entity |
| Matching | jobPostingId | Optimize for job-to-candidate queries |

### .NET 8 Container Setup

```csharp
// Infrastructure/CosmosDbSetup.cs
public class CosmosDbSetup
{
    public static async Task InitializeAsync(CosmosClient client, string databaseName)
    {
        var database = await client.CreateDatabaseIfNotExistsAsync(databaseName);

        // Main containers
        await database.Database.CreateContainerIfNotExistsAsync(
            new ContainerProperties("Candidates", "/partitionKey")
            {
                IndexingPolicy = new IndexingPolicy
                {
                    CompositeIndexes =
                    {
                        new Collection<CompositePath>
                        {
                            new() { Path = "/contractType", Order = CompositePathSortOrder.Ascending },
                            new() { Path = "/createdAt", Order = CompositePathSortOrder.Descending }
                        }
                    }
                }
            });

        // Sensitive data (separate for CNIL)
        await database.Database.CreateContainerIfNotExistsAsync(
            new ContainerProperties("SensitiveData", "/candidateId"));

        // Change logs (audit trail)
        await database.Database.CreateContainerIfNotExistsAsync(
            new ContainerProperties("ChangeLogs", "/entityId"));
    }
}
```

## Testing

```csharp
[Fact]
public async Task SchemaDesign_CandidateDocument_ValidStructure()
{
    var candidate = new Candidate
    {
        Id = "test-1",
        FirstName = "Jean",
        LastName = "Dupont",
        ContractType = ContractType.CDI,
        Skills = new List<string> { "React", ".NET 8" }
    };

    await _container.CreateItemAsync(candidate);
    var result = await _container.ReadItemAsync<Candidate>("test-1", new PartitionKey("test-1"));

    Assert.Equal("CDI", result.Resource.ContractType.ToString());
    Assert.Equal(2, result.Resource.Skills.Count);
}
```

## Related Skills

- `/add-audit-fields` - Audit tracking for schema
- `/setup-backup-strategy` - Backup schema-aware data
