---
name: add-mediator-pattern
description: Implement MediatR for loose coupling between application layers with command/query pipeline behaviors
argument-hint: "[pipeline-behaviors]"
tags: [architecture-patterns, mediator, cqrs, pipeline, decoupling]
---

# Add Mediator Pattern

Implements the Mediator pattern using MediatR to decouple request senders from handlers, add cross-cutting concerns (validation, logging, transactions), and support CQRS.

## When to Use

✅ **Use Mediator when:**
- Implementing CQRS pattern (commands and queries)
- Need centralized pipeline behaviors (validation, logging, caching)
- Want to reduce coupling between controllers and business logic
- Multiple layers need to communicate without direct dependencies
- French HR context: Complex workflows with multiple steps

❌ **Avoid Mediator when:**
- Simple CRUD with Controller-Service-Repository pattern (RH-OptimERP default)
- Team is unfamiliar with the pattern (learning curve)
- Application has fewer than 10 business operations
- Direct service injection is simpler and clearer

**Note:** RH-OptimERP uses **Controller-Service-Repository** as the default pattern. MediatR is optional for complex modules.

## Implementation

### .NET 8 (ASP.NET Core with MediatR)

**1. Install packages:**
```bash
dotnet add package MediatR --version 12.2.0
dotnet add package FluentValidation --version 11.9.0
dotnet add package FluentValidation.DependencyInjectionExtensions --version 11.9.0
```

**2. Configure in Program.cs:**
```csharp
using MediatR;
using FluentValidation;
using System.Reflection;

var builder = WebApplication.CreateBuilder(args);

// Register MediatR
builder.Services.AddMediatR(cfg =>
{
    cfg.RegisterServicesFromAssembly(Assembly.GetExecutingAssembly());
    cfg.AddOpenBehavior(typeof(ValidationBehavior<,>));
    cfg.AddOpenBehavior(typeof(LoggingBehavior<,>));
    cfg.AddOpenBehavior(typeof(TransactionBehavior<,>));
});

// Register FluentValidation validators
builder.Services.AddValidatorsFromAssembly(Assembly.GetExecutingAssembly());

builder.Services.AddControllers();

var app = builder.Build();
app.MapControllers();
app.Run();
```

**3. Define Request and Handler:**
```csharp
// Application/Candidates/Commands/CreateCandidateCommand.cs
using MediatR;

namespace Sourcing.CandidateAttraction.Application.Candidates.Commands
{
    public record CreateCandidateCommand(
        string FirstName,
        string LastName,
        string Email,
        string Phone,
        string ResumeUrl
    ) : IRequest<CreateCandidateResult>;

    public record CreateCandidateResult(
        string CandidateId,
        DateTime CreatedAt
    );
}

// Application/Candidates/Handlers/CreateCandidateHandler.cs
using MediatR;
using Sourcing.CandidateAttraction.Domain.Models;
using Sourcing.CandidateAttraction.Domain.Repositories;

namespace Sourcing.CandidateAttraction.Application.Candidates.Handlers
{
    public class CreateCandidateHandler : IRequestHandler<CreateCandidateCommand, CreateCandidateResult>
    {
        private readonly ICandidateRepository _repository;
        private readonly ILogger<CreateCandidateHandler> _logger;

        public CreateCandidateHandler(
            ICandidateRepository repository,
            ILogger<CreateCandidateHandler> logger)
        {
            _repository = repository;
            _logger = logger;
        }

        public async Task<CreateCandidateResult> Handle(
            CreateCandidateCommand request,
            CancellationToken cancellationToken)
        {
            _logger.LogInformation("Creating candidate: {Email}", request.Email);

            var candidate = new Candidate
            {
                Id = Guid.NewGuid().ToString(),
                FirstName = request.FirstName,
                LastName = request.LastName,
                Email = request.Email,
                Phone = request.Phone,
                ResumeUrl = request.ResumeUrl,
                CreatedAt = DateTime.UtcNow
            };

            await _repository.CreateAsync(candidate);

            return new CreateCandidateResult(candidate.Id, candidate.CreatedAt);
        }
    }
}
```

**4. Controller (Thin Layer):**
```csharp
using MediatR;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
public class CandidatesController : ControllerBase
{
    private readonly IMediator _mediator;

    public CandidatesController(IMediator mediator)
    {
        _mediator = mediator;
    }

    [HttpPost]
    public async Task<IActionResult> CreateCandidate([FromBody] CreateCandidateCommand command)
    {
        var result = await _mediator.Send(command);
        return CreatedAtAction(nameof(GetCandidate), new { id = result.CandidateId }, result);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetCandidate(string id)
    {
        var query = new GetCandidateQuery(id);
        var result = await _mediator.Send(query);

        if (result == null)
            return NotFound(new { message = "Candidat non trouvé" });

        return Ok(result);
    }
}
```

**5. Pipeline Behavior: Validation:**
```csharp
// Application/Behaviors/ValidationBehavior.cs
using FluentValidation;
using MediatR;

public class ValidationBehavior<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse>
    where TRequest : IRequest<TResponse>
{
    private readonly IEnumerable<IValidator<TRequest>> _validators;

    public ValidationBehavior(IEnumerable<IValidator<TRequest>> validators)
    {
        _validators = validators;
    }

    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        if (!_validators.Any())
            return await next();

        var context = new ValidationContext<TRequest>(request);

        var validationResults = await Task.WhenAll(
            _validators.Select(v => v.ValidateAsync(context, cancellationToken))
        );

        var failures = validationResults
            .SelectMany(r => r.Errors)
            .Where(f => f != null)
            .ToList();

        if (failures.Any())
            throw new ValidationException(failures);

        return await next();
    }
}

// Validator for CreateCandidateCommand
using FluentValidation;

public class CreateCandidateValidator : AbstractValidator<CreateCandidateCommand>
{
    public CreateCandidateValidator()
    {
        RuleFor(x => x.FirstName)
            .NotEmpty().WithMessage("Le prénom est obligatoire")
            .MaximumLength(100).WithMessage("Le prénom ne peut pas dépasser 100 caractères");

        RuleFor(x => x.LastName)
            .NotEmpty().WithMessage("Le nom est obligatoire")
            .MaximumLength(100).WithMessage("Le nom ne peut pas dépasser 100 caractères");

        RuleFor(x => x.Email)
            .NotEmpty().WithMessage("L'email est obligatoire")
            .EmailAddress().WithMessage("Format d'email invalide");

        RuleFor(x => x.Phone)
            .NotEmpty().WithMessage("Le téléphone est obligatoire")
            .Matches(@"^(\+33|0)[1-9](\d{8})$").WithMessage("Format de téléphone français invalide");
    }
}
```

**6. Pipeline Behavior: Logging:**
```csharp
// Application/Behaviors/LoggingBehavior.cs
using MediatR;

public class LoggingBehavior<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse>
    where TRequest : IRequest<TResponse>
{
    private readonly ILogger<LoggingBehavior<TRequest, TResponse>> _logger;

    public LoggingBehavior(ILogger<LoggingBehavior<TRequest, TResponse>> logger)
    {
        _logger = logger;
    }

    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        var requestName = typeof(TRequest).Name;
        _logger.LogInformation("Handling {RequestName}: {@Request}", requestName, request);

        var stopwatch = System.Diagnostics.Stopwatch.StartNew();

        try
        {
            var response = await next();

            stopwatch.Stop();
            _logger.LogInformation(
                "Handled {RequestName} in {ElapsedMs}ms",
                requestName,
                stopwatch.ElapsedMilliseconds
            );

            return response;
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            _logger.LogError(
                ex,
                "Error handling {RequestName} after {ElapsedMs}ms",
                requestName,
                stopwatch.ElapsedMilliseconds
            );
            throw;
        }
    }
}
```

**7. Pipeline Behavior: Transaction:**
```csharp
// Application/Behaviors/TransactionBehavior.cs
using MediatR;

public class TransactionBehavior<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse>
    where TRequest : IRequest<TResponse>
{
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILogger<TransactionBehavior<TRequest, TResponse>> _logger;

    public TransactionBehavior(IUnitOfWork unitOfWork, ILogger<TransactionBehavior<TRequest, TResponse>> logger)
    {
        _unitOfWork = unitOfWork;
        _logger = logger;
    }

    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        // Only wrap commands in transactions (not queries)
        if (request is not ICommand)
            return await next();

        _logger.LogInformation("Beginning transaction for {RequestName}", typeof(TRequest).Name);

        try
        {
            await _unitOfWork.BeginTransactionAsync(cancellationToken);

            var response = await next();

            await _unitOfWork.CommitAsync(cancellationToken);
            _logger.LogInformation("Transaction committed for {RequestName}", typeof(TRequest).Name);

            return response;
        }
        catch (Exception)
        {
            await _unitOfWork.RollbackAsync(cancellationToken);
            _logger.LogWarning("Transaction rolled back for {RequestName}", typeof(TRequest).Name);
            throw;
        }
    }
}

// Marker interface for commands (vs queries)
public interface ICommand : IRequest { }
public interface ICommand<TResponse> : IRequest<TResponse> { }
```

### Node.js/TypeScript (Custom Mediator)

**1. Mediator Implementation:**
```typescript
// infrastructure/mediator/Mediator.ts
type RequestHandler<TRequest, TResponse> = (request: TRequest) => Promise<TResponse>;
type PipelineBehavior<TRequest, TResponse> = (
  request: TRequest,
  next: () => Promise<TResponse>
) => Promise<TResponse>;

export class Mediator {
  private handlers = new Map<string, RequestHandler<any, any>>();
  private behaviors: PipelineBehavior<any, any>[] = [];

  registerHandler<TRequest, TResponse>(
    requestType: string,
    handler: RequestHandler<TRequest, TResponse>
  ): void {
    this.handlers.set(requestType, handler);
  }

  addBehavior<TRequest, TResponse>(
    behavior: PipelineBehavior<TRequest, TResponse>
  ): void {
    this.behaviors.push(behavior);
  }

  async send<TRequest, TResponse>(request: TRequest & { type: string }): Promise<TResponse> {
    const handler = this.handlers.get(request.type);
    if (!handler) {
      throw new Error(`No handler registered for ${request.type}`);
    }

    // Build pipeline with behaviors
    let pipeline = () => handler(request);

    for (const behavior of this.behaviors.reverse()) {
      const currentPipeline = pipeline;
      pipeline = () => behavior(request, currentPipeline);
    }

    return pipeline();
  }
}
```

**2. Usage:**
```typescript
// Setup
const mediator = new Mediator();

// Register handler
mediator.registerHandler<CreateCandidateCommand, CreateCandidateResult>(
  'CREATE_CANDIDATE',
  async (command) => {
    const candidate = await candidateRepository.create({
      firstName: command.firstName,
      lastName: command.lastName,
      email: command.email
    });
    return { candidateId: candidate.id, createdAt: candidate.createdAt };
  }
);

// Add logging behavior
mediator.addBehavior(async (request, next) => {
  console.log('Handling:', request.type);
  const result = await next();
  console.log('Handled:', request.type);
  return result;
});

// Send request
const result = await mediator.send({
  type: 'CREATE_CANDIDATE',
  firstName: 'Jean',
  lastName: 'Dupont',
  email: 'jean.dupont@example.fr'
});
```

## French HR Compliance

**CNIL Audit Trail:**
```csharp
// Add audit behavior to pipeline
public class AuditBehavior<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse>
    where TRequest : IRequest<TResponse>
{
    private readonly IAuditService _auditService;
    private readonly IHttpContextAccessor _contextAccessor;

    public AuditBehavior(IAuditService auditService, IHttpContextAccessor contextAccessor)
    {
        _auditService = auditService;
        _contextAccessor = contextAccessor;
    }

    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        var userId = _contextAccessor.HttpContext?.User.FindFirst("user_id")?.Value;
        var requestName = typeof(TRequest).Name;

        await _auditService.LogActionAsync(new AuditEntry
        {
            UserId = userId,
            Action = requestName,
            Timestamp = DateTime.UtcNow,
            Details = System.Text.Json.JsonSerializer.Serialize(request)
        });

        return await next();
    }
}
```

## Testing

```csharp
[Fact]
public async Task Send_ValidCommand_ReturnsResult()
{
    // Arrange
    var mockRepository = new Mock<ICandidateRepository>();
    var handler = new CreateCandidateHandler(mockRepository.Object, _logger);

    var command = new CreateCandidateCommand(
        "Jean", "Dupont", "jean.dupont@example.fr", "+33612345678", "https://resume.pdf"
    );

    // Act
    var result = await handler.Handle(command, CancellationToken.None);

    // Assert
    Assert.NotNull(result.CandidateId);
    mockRepository.Verify(x => x.CreateAsync(It.IsAny<Candidate>()), Times.Once);
}

[Fact]
public async Task ValidationBehavior_InvalidCommand_ThrowsValidationException()
{
    // Arrange
    var command = new CreateCandidateCommand("", "", "invalid-email", "", "");
    var validator = new CreateCandidateValidator();

    // Act & Assert
    var validationResult = await validator.ValidateAsync(command);
    Assert.False(validationResult.IsValid);
    Assert.Contains(validationResult.Errors, e => e.PropertyName == "FirstName");
    Assert.Contains(validationResult.Errors, e => e.PropertyName == "Email");
}
```

## Related Skills

- `/implement-cqrs` - Implement CQRS pattern with MediatR
- `/add-repository-unitofwork` - Add repository and unit of work patterns
- `/implement-clean-architecture` - Implement Clean Architecture
