---
name: implement-cqrs
description: Implement Command Query Responsibility Segregation pattern to separate read and write operations for scalability
argument-hint: "[event-sourcing] [read-model-strategy]"
tags: [architecture-patterns, cqrs, event-sourcing, scalability, ddd]
---

# Implement CQRS Pattern

Implements Command Query Responsibility Segregation (CQRS) to separate write operations (commands) from read operations (queries), optimizing for French HR high-volume scenarios.

## When to Use

✅ **Use CQRS when:**
- Read and write workloads have different scaling requirements
- Complex business logic for writes, simple projections for reads
- French HR context: Paie processing (write-heavy) vs reporting (read-heavy)
- Event sourcing is beneficial for audit trail compliance (CNIL)
- Multiple read models needed (list views, reports, dashboards)

❌ **Avoid CQRS when:**
- Simple CRUD applications (Controller-Service-Repository is sufficient)
- Team lacks experience with eventual consistency
- Real-time read-after-write consistency is critical
- Project has fewer than 1000 daily transactions

## CQRS Patterns

| Pattern | Complexity | Consistency | Use Case |
|---------|------------|-------------|----------|
| **CQRS (basic)** | Medium | Eventual | Separate read/write models, shared DB |
| **CQRS + Event Sourcing** | High | Eventual | Full audit trail, event replay |
| **CQRS + Materialized Views** | Medium | Eventual | Optimized read projections |
| **CQRS + Separate DB** | High | Eventual | Independent scaling for reads/writes |

**Note for RH-OptimERP:** We use **Controller-Service-Repository** pattern, NOT CQRS, for most microservices. CQRS is reserved for high-volume modules like Paie processing or Time & Attendance.

## Implementation

### .NET 8 (ASP.NET Core with MediatR)

**1. Install packages:**
```bash
dotnet add package MediatR --version 12.2.0
dotnet add package MediatR.Extensions.Microsoft.DependencyInjection --version 11.1.0
```

**2. Define Commands and Queries:**
```csharp
// Application/Commands/CreateEmployeeCommand.cs
using MediatR;

namespace Payroll.Application.Commands
{
    public record CreateEmployeeCommand(
        string FirstName,
        string LastName,
        string Email,
        string Nir,
        decimal MonthlySalary,
        string ContractType // CDI, CDD, CDIC
    ) : IRequest<CreateEmployeeResult>;

    public record CreateEmployeeResult(
        string EmployeeId,
        DateTime CreatedAt
    );
}

// Application/Queries/GetEmployeeQuery.cs
using MediatR;

namespace Payroll.Application.Queries
{
    public record GetEmployeeQuery(string EmployeeId) : IRequest<EmployeeReadModel?>;

    public record EmployeeReadModel(
        string Id,
        string FullName,
        string Email,
        string ContractType,
        decimal MonthlySalary, // Only for authorized roles
        DateTime CreatedAt
    );
}
```

**3. Command Handler (Write Side):**
```csharp
// Application/Commands/Handlers/CreateEmployeeHandler.cs
using MediatR;
using Payroll.Domain.Models;
using Payroll.Domain.Repositories;

namespace Payroll.Application.Commands.Handlers
{
    public class CreateEmployeeHandler : IRequestHandler<CreateEmployeeCommand, CreateEmployeeResult>
    {
        private readonly IEmployeeWriteRepository _writeRepository;
        private readonly IEventPublisher _eventPublisher; // Publish domain events

        public CreateEmployeeHandler(
            IEmployeeWriteRepository writeRepository,
            IEventPublisher eventPublisher)
        {
            _writeRepository = writeRepository;
            _eventPublisher = eventPublisher;
        }

        public async Task<CreateEmployeeResult> Handle(
            CreateEmployeeCommand command,
            CancellationToken cancellationToken)
        {
            // 1. Validate business rules
            if (!IsValidNir(command.Nir))
                throw new DomainException("NIR invalide (Numéro de Sécurité Sociale)");

            // 2. Create domain entity
            var employee = new Employee
            {
                Id = Guid.NewGuid().ToString(),
                FirstName = command.FirstName,
                LastName = command.LastName,
                Email = command.Email,
                NirEncrypted = await EncryptNirAsync(command.Nir),
                MonthlySalary = command.MonthlySalary,
                ContractType = command.ContractType,
                CreatedAt = DateTime.UtcNow
            };

            // 3. Persist to write store
            await _writeRepository.AddAsync(employee, cancellationToken);

            // 4. Publish domain event (for read model projection)
            await _eventPublisher.PublishAsync(new EmployeeCreatedEvent(
                employee.Id,
                employee.FirstName,
                employee.LastName,
                employee.Email,
                employee.ContractType,
                employee.CreatedAt
            ), cancellationToken);

            return new CreateEmployeeResult(employee.Id, employee.CreatedAt);
        }

        private bool IsValidNir(string nir) =>
            !string.IsNullOrEmpty(nir) && nir.Replace(" ", "").Length == 15;

        private async Task<string> EncryptNirAsync(string nir) =>
            await _encryptionService.EncryptAsync(nir, "employee-key");
    }
}
```

**4. Query Handler (Read Side):**
```csharp
// Application/Queries/Handlers/GetEmployeeHandler.cs
using MediatR;

namespace Payroll.Application.Queries.Handlers
{
    public class GetEmployeeHandler : IRequestHandler<GetEmployeeQuery, EmployeeReadModel?>
    {
        private readonly IEmployeeReadRepository _readRepository;

        public GetEmployeeHandler(IEmployeeReadRepository readRepository)
        {
            _readRepository = readRepository;
        }

        public async Task<EmployeeReadModel?> Handle(
            GetEmployeeQuery query,
            CancellationToken cancellationToken)
        {
            // Query optimized read model (denormalized, indexed)
            var employee = await _readRepository.GetByIdAsync(query.EmployeeId, cancellationToken);

            if (employee == null)
                return null;

            return new EmployeeReadModel(
                employee.Id,
                $"{employee.FirstName} {employee.LastName}",
                employee.Email,
                employee.ContractType,
                employee.MonthlySalary,
                employee.CreatedAt
            );
        }
    }
}
```

**5. Event Handler (Update Read Model):**
```csharp
// Application/Events/EmployeeCreatedEventHandler.cs
using MediatR;

namespace Payroll.Application.Events
{
    public record EmployeeCreatedEvent(
        string EmployeeId,
        string FirstName,
        string LastName,
        string Email,
        string ContractType,
        DateTime CreatedAt
    ) : INotification;

    public class EmployeeCreatedEventHandler : INotificationHandler<EmployeeCreatedEvent>
    {
        private readonly IEmployeeReadRepository _readRepository;

        public EmployeeCreatedEventHandler(IEmployeeReadRepository readRepository)
        {
            _readRepository = readRepository;
        }

        public async Task Handle(EmployeeCreatedEvent @event, CancellationToken cancellationToken)
        {
            // Project event to read model (denormalized)
            var readModel = new EmployeeReadModel(
                @event.EmployeeId,
                $"{@event.FirstName} {@event.LastName}",
                @event.Email,
                @event.ContractType,
                0, // Salary not in read model for security
                @event.CreatedAt
            );

            await _readRepository.UpsertAsync(readModel, cancellationToken);
        }
    }
}
```

**6. Configure MediatR in Program.cs:**
```csharp
using MediatR;
using System.Reflection;

var builder = WebApplication.CreateBuilder(args);

// Register MediatR with all handlers from Application assembly
builder.Services.AddMediatR(cfg =>
    cfg.RegisterServicesFromAssembly(Assembly.GetExecutingAssembly()));

// Register repositories
builder.Services.AddScoped<IEmployeeWriteRepository, EmployeeWriteRepository>();
builder.Services.AddScoped<IEmployeeReadRepository, EmployeeReadRepository>();
builder.Services.AddSingleton<IEventPublisher, EventPublisher>();

builder.Services.AddControllers();

var app = builder.Build();
app.MapControllers();
app.Run();
```

**7. Controller (Thin Layer):**
```csharp
// Controllers/EmployeesController.cs
using MediatR;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
public class EmployeesController : ControllerBase
{
    private readonly IMediator _mediator;

    public EmployeesController(IMediator mediator)
    {
        _mediator = mediator;
    }

    // Command: Write operation
    [HttpPost]
    public async Task<IActionResult> CreateEmployee([FromBody] CreateEmployeeCommand command)
    {
        var result = await _mediator.Send(command);
        return CreatedAtAction(nameof(GetEmployee), new { id = result.EmployeeId }, result);
    }

    // Query: Read operation
    [HttpGet("{id}")]
    public async Task<IActionResult> GetEmployee(string id)
    {
        var query = new GetEmployeeQuery(id);
        var result = await _mediator.Send(query);

        if (result == null)
            return NotFound(new { message = "Employé non trouvé" });

        return Ok(result);
    }

    // Command: Update operation
    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateEmployee(string id, [FromBody] UpdateEmployeeCommand command)
    {
        if (id != command.EmployeeId)
            return BadRequest(new { message = "ID mismatch" });

        await _mediator.Send(command);
        return NoContent();
    }
}
```

### Node.js/TypeScript (with EventEmitter)

**1. Command and Query Types:**
```typescript
// application/commands/CreateEmployeeCommand.ts
export interface CreateEmployeeCommand {
  type: 'CREATE_EMPLOYEE';
  payload: {
    firstName: string;
    lastName: string;
    email: string;
    nir: string;
    monthlySalary: number;
    contractType: 'CDI' | 'CDD' | 'CDIC';
  };
}

export interface CreateEmployeeResult {
  employeeId: string;
  createdAt: Date;
}

// application/queries/GetEmployeeQuery.ts
export interface GetEmployeeQuery {
  type: 'GET_EMPLOYEE';
  employeeId: string;
}

export interface EmployeeReadModel {
  id: string;
  fullName: string;
  email: string;
  contractType: string;
  createdAt: Date;
}
```

**2. Command Handler:**
```typescript
// application/handlers/CreateEmployeeHandler.ts
import { EventEmitter } from 'events';
import { EmployeeWriteRepository } from '../../infrastructure/repositories/EmployeeWriteRepository';
import { CreateEmployeeCommand, CreateEmployeeResult } from '../commands/CreateEmployeeCommand';

export class CreateEmployeeHandler {
  constructor(
    private writeRepository: EmployeeWriteRepository,
    private eventEmitter: EventEmitter
  ) {}

  async handle(command: CreateEmployeeCommand): Promise<CreateEmployeeResult> {
    // 1. Validate
    if (!this.isValidNir(command.payload.nir)) {
      throw new Error('NIR invalide');
    }

    // 2. Create entity
    const employee = {
      id: crypto.randomUUID(),
      firstName: command.payload.firstName,
      lastName: command.payload.lastName,
      email: command.payload.email,
      nirEncrypted: await this.encryptNir(command.payload.nir),
      monthlySalary: command.payload.monthlySalary,
      contractType: command.payload.contractType,
      createdAt: new Date()
    };

    // 3. Persist
    await this.writeRepository.add(employee);

    // 4. Publish event
    this.eventEmitter.emit('EMPLOYEE_CREATED', {
      employeeId: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
      contractType: employee.contractType,
      createdAt: employee.createdAt
    });

    return {
      employeeId: employee.id,
      createdAt: employee.createdAt
    };
  }

  private isValidNir(nir: string): boolean {
    return nir.replace(/\s/g, '').length === 15;
  }

  private async encryptNir(nir: string): Promise<string> {
    // Encryption logic
    return nir; // Placeholder
  }
}
```

**3. Query Handler:**
```typescript
// application/handlers/GetEmployeeHandler.ts
import { EmployeeReadRepository } from '../../infrastructure/repositories/EmployeeReadRepository';
import { GetEmployeeQuery, EmployeeReadModel } from '../queries/GetEmployeeQuery';

export class GetEmployeeHandler {
  constructor(private readRepository: EmployeeReadRepository) {}

  async handle(query: GetEmployeeQuery): Promise<EmployeeReadModel | null> {
    const employee = await this.readRepository.getById(query.employeeId);

    if (!employee) {
      return null;
    }

    return {
      id: employee.id,
      fullName: `${employee.firstName} ${employee.lastName}`,
      email: employee.email,
      contractType: employee.contractType,
      createdAt: employee.createdAt
    };
  }
}
```

## Separate Read and Write Repositories

**Write Repository (Normalized, transactional):**
```csharp
public interface IEmployeeWriteRepository
{
    Task AddAsync(Employee employee, CancellationToken cancellationToken = default);
    Task UpdateAsync(Employee employee, CancellationToken cancellationToken = default);
    Task DeleteAsync(string id, CancellationToken cancellationToken = default);
}
```

**Read Repository (Denormalized, optimized for queries):**
```csharp
public interface IEmployeeReadRepository
{
    Task<EmployeeReadModel?> GetByIdAsync(string id, CancellationToken cancellationToken = default);
    Task<PagedResult<EmployeeReadModel>> GetAllAsync(int page, int pageSize, CancellationToken cancellationToken = default);
    Task UpsertAsync(EmployeeReadModel readModel, CancellationToken cancellationToken = default);
}
```

## French HR Compliance

**CNIL Requirements:**
- ✅ Event sourcing provides full audit trail (Art. 30 GDPR)
- ✅ Read models can be anonymized separately from write models
- ✅ Separate salary data access (read model without salary field)

**Best Practices:**
```csharp
// Separate read models by access level
public record EmployeePublicReadModel(string Id, string FullName, string Email);
public record EmployeePayrollReadModel(string Id, string FullName, decimal Salary, string Iban);

// Role-based query
[Authorize(Policy = "ViewSalaryData")]
[HttpGet("{id}/payroll")]
public async Task<IActionResult> GetEmployeePayroll(string id)
{
    var query = new GetEmployeePayrollQuery(id);
    var result = await _mediator.Send(query);
    return Ok(result);
}
```

## Testing

```csharp
[Fact]
public async Task CreateEmployee_ValidCommand_PublishesEvent()
{
    // Arrange
    var mockEventPublisher = new Mock<IEventPublisher>();
    var handler = new CreateEmployeeHandler(_writeRepository, mockEventPublisher.Object);

    var command = new CreateEmployeeCommand(
        "Jean", "Dupont", "jean.dupont@company.fr",
        "1 85 03 75 116 238 91", 3500m, "CDI"
    );

    // Act
    var result = await handler.Handle(command, CancellationToken.None);

    // Assert
    Assert.NotNull(result.EmployeeId);
    mockEventPublisher.Verify(
        x => x.PublishAsync(It.IsAny<EmployeeCreatedEvent>(), It.IsAny<CancellationToken>()),
        Times.Once
    );
}
```

## Related Skills

- `/add-mediator-pattern` - Implement MediatR for CQRS
- `/implement-event-sourcing` - Add full event sourcing
- `/add-repository-unitofwork` - Implement repository pattern
