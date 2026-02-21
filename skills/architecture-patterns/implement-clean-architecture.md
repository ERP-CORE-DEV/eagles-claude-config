---
name: implement-clean-architecture
description: Implement Clean Architecture (Onion Architecture) with strict dependency inversion and domain-centric design
argument-hint: "[layers] [ddd-level]"
tags: [architecture-patterns, clean-architecture, onion, ddd, solid]
---

# Implement Clean Architecture

Implements Clean Architecture (also known as Onion Architecture or Hexagonal Architecture) with strict dependency inversion where domain logic is at the center and infrastructure concerns are pushed to the outer layers.

## When to Use

**Use Clean Architecture when:**
- Large-scale enterprise systems with complex domain logic
- Long-lived projects where maintainability is critical
- Multiple teams working on different layers independently
- Need to swap infrastructure (DB, messaging) without changing business logic
- Regulated environments requiring testable, auditable code (French HR: CNIL, GDPR)

**Avoid Clean Architecture when:**
- Simple CRUD applications (Controller-Service-Repository is sufficient)
- Small team, short project lifecycle (overhead not justified)
- Performance-critical paths where layer abstraction adds latency
- RH-OptimERP default pattern is Controller-Service-Repository, NOT Clean Architecture

**Note:** RH-OptimERP uses Controller-Service-Repository as the standard pattern. Clean Architecture is reserved for complex bounded contexts.

## Layer Structure

```
Solution/
  src/
    Domain/                 # Core business logic (NO external dependencies)
      Entities/
      ValueObjects/
      Interfaces/           # Repository interfaces, service contracts
      Events/
      Exceptions/
    Application/            # Use cases, orchestration
      Commands/
      Queries/
      DTOs/
      Behaviors/            # Validation, logging pipelines
      Interfaces/           # External service contracts
    Infrastructure/         # External concerns
      Persistence/          # CosmosDB, SQL Server implementations
      Identity/             # Authentication, authorization
      Messaging/            # Azure Service Bus
      ExternalServices/     # Third-party APIs
    Presentation/           # Entry points
      WebApi/               # ASP.NET Core controllers
      Workers/              # Background services
```

## Dependency Rule

**Inner layers NEVER depend on outer layers:**
```
Presentation --> Application --> Domain <-- Infrastructure
     |               |             ^           |
     |               |             |           |
     +---------------+-------------+-----------+
                 (all depend on Domain)
```

## Implementation

### .NET 8

**1. Domain Layer (Zero Dependencies):**
```csharp
// Domain/Entities/Candidate.cs
namespace Sourcing.Domain.Entities
{
    public class Candidate
    {
        public string Id { get; private set; }
        public string FirstName { get; private set; }
        public string LastName { get; private set; }
        public Email Email { get; private set; }
        public PhoneNumber Phone { get; private set; }
        public ContractType PreferredContract { get; private set; }
        public DateTime CreatedAt { get; private set; }
        public bool IsAnonymized { get; private set; }

        // Factory method with validation
        public static Candidate Create(
            string firstName, string lastName,
            string email, string phone,
            ContractType contractType)
        {
            if (string.IsNullOrWhiteSpace(firstName))
                throw new DomainException("Le prenom est obligatoire");
            if (string.IsNullOrWhiteSpace(lastName))
                throw new DomainException("Le nom est obligatoire");

            return new Candidate
            {
                Id = Guid.NewGuid().ToString(),
                FirstName = firstName,
                LastName = lastName,
                Email = Email.Create(email),
                Phone = PhoneNumber.Create(phone),
                PreferredContract = contractType,
                CreatedAt = DateTime.UtcNow
            };
        }

        // GDPR: Anonymize candidate data
        public void Anonymize()
        {
            FirstName = "***ANONYMISE***";
            LastName = "***ANONYMISE***";
            Email = Email.Create("anonymise@anonymise.fr");
            Phone = PhoneNumber.Create("+33000000000");
            IsAnonymized = true;
        }
    }

    // Value Object
    public record Email
    {
        public string Value { get; }

        private Email(string value) => Value = value;

        public static Email Create(string email)
        {
            if (!email.Contains('@'))
                throw new DomainException("Format d'email invalide");
            return new Email(email.ToLowerInvariant());
        }
    }

    public record PhoneNumber
    {
        public string Value { get; }

        private PhoneNumber(string value) => Value = value;

        public static PhoneNumber Create(string phone)
        {
            var cleaned = phone.Replace(" ", "").Replace(".", "").Replace("-", "");
            if (!System.Text.RegularExpressions.Regex.IsMatch(cleaned, @"^(\+33|0)[1-9]\d{8}$"))
                throw new DomainException("Format de telephone francais invalide");
            return new PhoneNumber(cleaned);
        }
    }

    public enum ContractType { CDI, CDD, CDIC, Interim, Stage, Alternance }
}

// Domain/Interfaces/ICandidateRepository.cs
namespace Sourcing.Domain.Interfaces
{
    public interface ICandidateRepository
    {
        Task<Candidate?> GetByIdAsync(string id, CancellationToken ct = default);
        Task<IReadOnlyList<Candidate>> GetAllAsync(int page, int pageSize, CancellationToken ct = default);
        Task AddAsync(Candidate candidate, CancellationToken ct = default);
        Task UpdateAsync(Candidate candidate, CancellationToken ct = default);
        Task DeleteAsync(string id, CancellationToken ct = default);
    }
}

// Domain/Exceptions/DomainException.cs
namespace Sourcing.Domain.Exceptions
{
    public class DomainException : Exception
    {
        public DomainException(string message) : base(message) { }
    }
}
```

**2. Application Layer (Depends on Domain only):**
```csharp
// Application/Commands/CreateCandidateCommand.cs
using MediatR;

namespace Sourcing.Application.Commands
{
    public record CreateCandidateCommand(
        string FirstName,
        string LastName,
        string Email,
        string Phone,
        string ContractType
    ) : IRequest<CandidateDto>;
}

// Application/Handlers/CreateCandidateHandler.cs
using MediatR;
using Sourcing.Domain.Entities;
using Sourcing.Domain.Interfaces;

namespace Sourcing.Application.Handlers
{
    public class CreateCandidateHandler : IRequestHandler<CreateCandidateCommand, CandidateDto>
    {
        private readonly ICandidateRepository _repository;

        public CreateCandidateHandler(ICandidateRepository repository)
        {
            _repository = repository;
        }

        public async Task<CandidateDto> Handle(
            CreateCandidateCommand request,
            CancellationToken cancellationToken)
        {
            var contractType = Enum.Parse<ContractType>(request.ContractType);

            var candidate = Candidate.Create(
                request.FirstName,
                request.LastName,
                request.Email,
                request.Phone,
                contractType
            );

            await _repository.AddAsync(candidate, cancellationToken);

            return CandidateDto.FromDomain(candidate);
        }
    }
}

// Application/DTOs/CandidateDto.cs
namespace Sourcing.Application.DTOs
{
    public record CandidateDto(
        string Id,
        string FirstName,
        string LastName,
        string Email,
        string Phone,
        string ContractType,
        DateTime CreatedAt
    )
    {
        public static CandidateDto FromDomain(Candidate candidate) => new(
            candidate.Id,
            candidate.FirstName,
            candidate.LastName,
            candidate.Email.Value,
            candidate.Phone.Value,
            candidate.PreferredContract.ToString(),
            candidate.CreatedAt
        );
    }
}
```

**3. Infrastructure Layer (Implements Domain interfaces):**
```csharp
// Infrastructure/Persistence/CosmosCandidateRepository.cs
using Microsoft.Azure.Cosmos;
using Sourcing.Domain.Entities;
using Sourcing.Domain.Interfaces;

namespace Sourcing.Infrastructure.Persistence
{
    public class CosmosCandidateRepository : ICandidateRepository
    {
        private readonly Container _container;

        public CosmosCandidateRepository(CosmosClient cosmosClient, IConfiguration config)
        {
            var database = config["CosmosDb:DatabaseName"];
            _container = cosmosClient.GetContainer(database, "Candidates");
        }

        public async Task<Candidate?> GetByIdAsync(string id, CancellationToken ct = default)
        {
            try
            {
                var response = await _container.ReadItemAsync<Candidate>(id, new PartitionKey(id), cancellationToken: ct);
                return response.Resource;
            }
            catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                return null;
            }
        }

        public async Task AddAsync(Candidate candidate, CancellationToken ct = default)
        {
            await _container.CreateItemAsync(candidate, new PartitionKey(candidate.Id), cancellationToken: ct);
        }

        public async Task UpdateAsync(Candidate candidate, CancellationToken ct = default)
        {
            await _container.UpsertItemAsync(candidate, new PartitionKey(candidate.Id), cancellationToken: ct);
        }

        public async Task DeleteAsync(string id, CancellationToken ct = default)
        {
            await _container.DeleteItemAsync<Candidate>(id, new PartitionKey(id), cancellationToken: ct);
        }

        public async Task<IReadOnlyList<Candidate>> GetAllAsync(int page, int pageSize, CancellationToken ct = default)
        {
            var query = new QueryDefinition("SELECT * FROM c ORDER BY c.createdAt DESC OFFSET @offset LIMIT @limit")
                .WithParameter("@offset", (page - 1) * pageSize)
                .WithParameter("@limit", pageSize);

            var results = new List<Candidate>();
            using var iterator = _container.GetItemQueryIterator<Candidate>(query);
            while (iterator.HasMoreResults)
            {
                var response = await iterator.ReadNextAsync(ct);
                results.AddRange(response.Resource);
            }
            return results;
        }
    }
}
```

**4. Presentation Layer (ASP.NET Core):**
```csharp
// Presentation/Controllers/CandidatesController.cs
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace Sourcing.Presentation.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class CandidatesController : ControllerBase
    {
        private readonly IMediator _mediator;

        public CandidatesController(IMediator mediator) => _mediator = mediator;

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] CreateCandidateCommand command)
        {
            var result = await _mediator.Send(command);
            return CreatedAtAction(nameof(GetById), new { id = result.Id }, result);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(string id)
        {
            var result = await _mediator.Send(new GetCandidateQuery(id));
            return result is null ? NotFound(new { message = "Candidat non trouve" }) : Ok(result);
        }
    }
}
```

**5. DI Registration (Program.cs):**
```csharp
using Microsoft.Azure.Cosmos;
using Sourcing.Domain.Interfaces;
using Sourcing.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

// Domain - no registration needed (pure logic)

// Application
builder.Services.AddMediatR(cfg =>
    cfg.RegisterServicesFromAssembly(typeof(CreateCandidateHandler).Assembly));

// Infrastructure
builder.Services.AddSingleton(sp =>
{
    var config = sp.GetRequiredService<IConfiguration>();
    return new CosmosClient(config["CosmosDb:ConnectionString"]);
});
builder.Services.AddScoped<ICandidateRepository, CosmosCandidateRepository>();

// Presentation
builder.Services.AddControllers();

var app = builder.Build();
app.MapControllers();
app.Run();
```

### Node.js/TypeScript

```typescript
// Domain layer: src/domain/entities/Candidate.ts
export class Candidate {
  constructor(
    public readonly id: string,
    public firstName: string,
    public lastName: string,
    public email: string,
    public phone: string,
    public contractType: 'CDI' | 'CDD' | 'CDIC' | 'Interim',
    public createdAt: Date = new Date(),
    public isAnonymized: boolean = false
  ) {}

  static create(data: { firstName: string; lastName: string; email: string; phone: string; contractType: string }): Candidate {
    if (!data.firstName) throw new Error('Le prenom est obligatoire');
    if (!data.email.includes('@')) throw new Error('Email invalide');
    return new Candidate(crypto.randomUUID(), data.firstName, data.lastName, data.email, data.phone, data.contractType as any);
  }

  anonymize(): void {
    this.firstName = '***ANONYMISE***';
    this.lastName = '***ANONYMISE***';
    this.email = 'anonymise@anonymise.fr';
    this.phone = '+33000000000';
    this.isAnonymized = true;
  }
}

// Domain layer: src/domain/interfaces/ICandidateRepository.ts
export interface ICandidateRepository {
  getById(id: string): Promise<Candidate | null>;
  getAll(page: number, pageSize: number): Promise<Candidate[]>;
  add(candidate: Candidate): Promise<void>;
  update(candidate: Candidate): Promise<void>;
  delete(id: string): Promise<void>;
}
```

## French HR / CNIL Compliance

- Domain entities enforce GDPR with `Anonymize()` methods
- Value Objects validate French formats (phone, NIR)
- Encryption layer in Infrastructure (not Domain)
- Audit trail via Application pipeline behaviors

## Testing Strategy

```csharp
// Domain tests (no mocks needed - pure logic)
[Fact]
public void Candidate_Create_ValidData_Succeeds()
{
    var candidate = Candidate.Create("Jean", "Dupont", "jean@company.fr", "+33612345678", ContractType.CDI);
    Assert.Equal("Jean", candidate.FirstName);
    Assert.Equal("jean@company.fr", candidate.Email.Value);
}

[Fact]
public void Candidate_Create_InvalidPhone_ThrowsDomainException()
{
    Assert.Throws<DomainException>(() =>
        Candidate.Create("Jean", "Dupont", "jean@company.fr", "invalid", ContractType.CDI));
}

// Application tests (mock repository)
[Fact]
public async Task CreateCandidate_ValidCommand_CallsRepository()
{
    var mockRepo = new Mock<ICandidateRepository>();
    var handler = new CreateCandidateHandler(mockRepo.Object);

    await handler.Handle(new CreateCandidateCommand("Jean", "Dupont", "j@c.fr", "+33612345678", "CDI"), default);

    mockRepo.Verify(r => r.AddAsync(It.IsAny<Candidate>(), It.IsAny<CancellationToken>()), Times.Once);
}
```

## Related Skills

- `/implement-cqrs` - Implement CQRS with MediatR
- `/add-mediator-pattern` - Add MediatR pipeline behaviors
- `/add-repository-unitofwork` - Implement repository and unit of work
