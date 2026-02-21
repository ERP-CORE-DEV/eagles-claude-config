---
name: implement-saga-pattern
description: Implement Saga pattern for distributed transactions across microservices
tags: [microservices, saga, distributed-transactions, choreography, orchestration, event-driven]
complexity: COMPLEX
stacks: [dotnet, azure, rabbitmq, event-hubs]
related: [implement-event-sourcing, add-message-broker, implement-outbox-pattern]
---

# Implement Saga Pattern

Implement the Saga pattern to manage distributed transactions across RH-OptimERP's 12 microservices without relying on traditional ACID transactions. This skill covers both Choreography (event-driven) and Orchestration (centralized) Saga patterns for .NET 8 microservices.

## Context: RH-OptimERP Distributed Workflows

**French HR Hiring Process Example:**
1. **Recruitment**: Candidate accepts offer → `OfferAcceptedEvent`
2. **Payroll**: Create employee record → `EmployeeCreatedEvent`
3. **Document Mgmt**: Generate contract (CDI/CDD) → `ContractGeneratedEvent`
4. **Compliance**: DPAE declaration (Déclaration Préalable À l'Embauche) → `DpaeSubmittedEvent`
5. **Training**: Enroll in onboarding program → `OnboardingEnrolledEvent`
6. **IT**: Provision accounts (email, tools) → `AccountsProvisionedEvent`

**Failure Scenarios Requiring Compensation:**
- Payroll fails (duplicate employee) → Cancel offer, notify candidate
- DPAE submission fails (URSSAF timeout) → Rollback contract, retry DPAE
- Training enrollment fails (no seats) → Manual intervention, proceed anyway

**Business Rules:**
- Must complete within 48 hours (French labor law: DPAE within 8 days)
- GDPR: All compensation actions must delete candidate PII
- Audit trail required (CNIL compliance)

## Saga Pattern Types

### Type 1: Choreography Saga (Event-Driven)

**When to use:**
- Simple workflows (3-5 steps)
- Loose coupling preferred
- Each service owns its compensation logic

**Architecture:**
```
[Recruitment] --OfferAcceptedEvent--> [Payroll] --EmployeeCreatedEvent--> [Document Mgmt]
                                          |                                       |
                                    (failure)                              (success)
                                          |                                       |
                                          v                                       v
                                  [Compensation]                         [Compliance]
                                  CancelOfferEvent                    DpaeSubmittedEvent
```

**Implementation (Azure Service Bus):**

```csharp
// Shared/Events/HiringSagaEvents.cs
namespace RH.OptimERP.Shared.Events
{
    // Saga events
    public record OfferAcceptedEvent(
        string SagaId,
        string CandidateId,
        string OfferId,
        string ContractType,  // "CDI", "CDD", "CDIC"
        DateTime StartDate,
        decimal Salary
    );

    public record EmployeeCreatedEvent(
        string SagaId,
        string EmployeeId,
        string CandidateId
    );

    public record ContractGeneratedEvent(
        string SagaId,
        string EmployeeId,
        string ContractPdfUrl
    );

    public record DpaeSubmittedEvent(
        string SagaId,
        string EmployeeId,
        string DpaeNumber
    );

    public record OnboardingEnrolledEvent(
        string SagaId,
        string EmployeeId,
        string TrainingProgramId
    );

    // Compensation events
    public record EmployeeCreationFailedEvent(
        string SagaId,
        string CandidateId,
        string Reason
    );

    public record CancelOfferEvent(
        string SagaId,
        string CandidateId,
        string Reason
    );
}
```

**Payroll Service - Event Handler:**

```csharp
// PayrollService/Handlers/OfferAcceptedEventHandler.cs
using Azure.Messaging.ServiceBus;
using Microsoft.Extensions.Logging;

public class OfferAcceptedEventHandler : IHostedService
{
    private readonly ServiceBusProcessor _processor;
    private readonly IEmployeeService _employeeService;
    private readonly ServiceBusSender _sender;
    private readonly ILogger<OfferAcceptedEventHandler> _logger;

    public OfferAcceptedEventHandler(
        ServiceBusClient serviceBusClient,
        IEmployeeService employeeService,
        ILogger<OfferAcceptedEventHandler> logger)
    {
        _processor = serviceBusClient.CreateProcessor("offer-accepted-topic", "payroll-subscription");
        _employeeService = employeeService;
        _sender = serviceBusClient.CreateSender("employee-created-topic");
        _logger = logger;

        _processor.ProcessMessageAsync += ProcessMessageAsync;
        _processor.ProcessErrorAsync += ProcessErrorAsync;
    }

    private async Task ProcessMessageAsync(ProcessMessageEventArgs args)
    {
        var offerEvent = args.Message.Body.ToObjectFromJson<OfferAcceptedEvent>();
        _logger.LogInformation("Processing OfferAcceptedEvent for Saga {SagaId}", offerEvent.SagaId);

        try
        {
            // Create employee record
            var employee = new Employee
            {
                Id = Guid.NewGuid().ToString(),
                CandidateId = offerEvent.CandidateId,
                ContractType = offerEvent.ContractType,
                StartDate = offerEvent.StartDate,
                Salary = offerEvent.Salary,
                CreatedAt = DateTime.UtcNow
            };

            await _employeeService.CreateEmployeeAsync(employee);

            // Publish success event
            var successEvent = new EmployeeCreatedEvent(
                offerEvent.SagaId,
                employee.Id,
                offerEvent.CandidateId
            );
            await _sender.SendMessageAsync(new ServiceBusMessage(BinaryData.FromObjectAsJson(successEvent)));

            _logger.LogInformation("Employee created successfully: {EmployeeId}", employee.Id);
            await args.CompleteMessageAsync(args.Message);
        }
        catch (DuplicateEmployeeException ex)
        {
            _logger.LogError(ex, "Duplicate employee detected for Saga {SagaId}", offerEvent.SagaId);

            // Publish compensation event
            var failureEvent = new EmployeeCreationFailedEvent(
                offerEvent.SagaId,
                offerEvent.CandidateId,
                "Duplicate employee record"
            );
            await _sender.SendMessageAsync(new ServiceBusMessage(BinaryData.FromObjectAsJson(failureEvent)));

            await args.CompleteMessageAsync(args.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing OfferAcceptedEvent for Saga {SagaId}", offerEvent.SagaId);
            // Retry message (dead-letter after 5 attempts)
            await args.AbandonMessageAsync(args.Message);
        }
    }

    private Task ProcessErrorAsync(ProcessErrorEventArgs args)
    {
        _logger.LogError(args.Exception, "Service Bus error: {ErrorSource}", args.ErrorSource);
        return Task.CompletedTask;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        await _processor.StartProcessingAsync(cancellationToken);
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        await _processor.StopProcessingAsync(cancellationToken);
    }
}
```

**Recruitment Service - Compensation Handler:**

```csharp
// RecruitmentService/Handlers/EmployeeCreationFailedEventHandler.cs
public class EmployeeCreationFailedEventHandler : IHostedService
{
    private readonly ServiceBusProcessor _processor;
    private readonly IOfferService _offerService;
    private readonly INotificationService _notificationService;
    private readonly ILogger<EmployeeCreationFailedEventHandler> _logger;

    public EmployeeCreationFailedEventHandler(
        ServiceBusClient serviceBusClient,
        IOfferService offerService,
        INotificationService notificationService,
        ILogger<EmployeeCreationFailedEventHandler> logger)
    {
        _processor = serviceBusClient.CreateProcessor("employee-creation-failed-topic", "recruitment-subscription");
        _offerService = offerService;
        _notificationService = notificationService;
        _logger = logger;

        _processor.ProcessMessageAsync += ProcessMessageAsync;
        _processor.ProcessErrorAsync += ProcessErrorAsync;
    }

    private async Task ProcessMessageAsync(ProcessMessageEventArgs args)
    {
        var failureEvent = args.Message.Body.ToObjectFromJson<EmployeeCreationFailedEvent>();
        _logger.LogInformation("Compensating for Saga {SagaId}: {Reason}", failureEvent.SagaId, failureEvent.Reason);

        try
        {
            // Cancel offer
            await _offerService.CancelOfferAsync(failureEvent.CandidateId, failureEvent.Reason);

            // Notify candidate (email via Azure Communication Services)
            await _notificationService.SendEmailAsync(
                to: await _offerService.GetCandidateEmailAsync(failureEvent.CandidateId),
                subject: "Mise à jour de votre offre d'emploi",
                body: $"Nous sommes désolés, mais votre offre d'emploi a été annulée en raison d'un problème technique. Raison: {failureEvent.Reason}. Notre équipe RH vous contactera sous 24h."
            );

            _logger.LogInformation("Offer cancelled and candidate notified for Saga {SagaId}", failureEvent.SagaId);
            await args.CompleteMessageAsync(args.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error compensating for Saga {SagaId}", failureEvent.SagaId);
            await args.AbandonMessageAsync(args.Message);
        }
    }

    private Task ProcessErrorAsync(ProcessErrorEventArgs args)
    {
        _logger.LogError(args.Exception, "Service Bus error: {ErrorSource}", args.ErrorSource);
        return Task.CompletedTask;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        await _processor.StartProcessingAsync(cancellationToken);
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        await _processor.StopProcessingAsync(cancellationToken);
    }
}
```

### Type 2: Orchestration Saga (Centralized Coordinator)

**When to use:**
- Complex workflows (5+ steps)
- Explicit workflow state required
- Timeout handling needed
- Easier testing/debugging

**Architecture:**
```
                          [Saga Orchestrator]
                                  |
      +-----------+---------------+---------------+-----------+
      |           |               |               |           |
      v           v               v               v           v
  [Recruitment] [Payroll] [Document Mgmt] [Compliance] [Training]
      |           |               |               |           |
      +--success--+--success------+---failure-----+-----------+
                                  |
                          [Compensation]
```

**Implementation (MassTransit Saga State Machine):**

```bash
# Install MassTransit with Azure Service Bus
dotnet add package MassTransit --version 8.1.3
dotnet add package MassTransit.Azure.ServiceBus.Core --version 8.1.3
```

**Saga State Machine:**

```csharp
// SagaOrchestrator/StateMachines/HiringSagaStateMachine.cs
using MassTransit;

public class HiringSagaState : SagaStateMachineInstance
{
    public Guid CorrelationId { get; set; }
    public string CurrentState { get; set; }

    // Saga data
    public string CandidateId { get; set; }
    public string OfferId { get; set; }
    public string EmployeeId { get; set; }
    public string ContractPdfUrl { get; set; }
    public string DpaeNumber { get; set; }

    // Timestamps
    public DateTime StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }

    // Compensation tracking
    public bool PayrollCompensated { get; set; }
    public bool DocumentCompensated { get; set; }
}

public class HiringSagaStateMachine : MassTransitStateMachine<HiringSagaState>
{
    public State CreatingEmployee { get; private set; }
    public State GeneratingContract { get; private set; }
    public State SubmittingDpae { get; private set; }
    public State EnrollingTraining { get; private set; }
    public State Completed { get; private set; }
    public State Failed { get; private set; }

    public Event<OfferAcceptedEvent> OfferAccepted { get; private set; }
    public Event<EmployeeCreatedEvent> EmployeeCreated { get; private set; }
    public Event<ContractGeneratedEvent> ContractGenerated { get; private set; }
    public Event<DpaeSubmittedEvent> DpaeSubmitted { get; private set; }
    public Event<OnboardingEnrolledEvent> OnboardingEnrolled { get; private set; }

    // Failure events
    public Event<EmployeeCreationFailedEvent> EmployeeCreationFailed { get; private set; }
    public Event<ContractGenerationFailedEvent> ContractGenerationFailed { get; private set; }

    public HiringSagaStateMachine()
    {
        InstanceState(x => x.CurrentState);

        // Initial event: Offer accepted
        Initially(
            When(OfferAccepted)
                .Then(context =>
                {
                    context.Instance.CandidateId = context.Data.CandidateId;
                    context.Instance.OfferId = context.Data.OfferId;
                    context.Instance.StartedAt = DateTime.UtcNow;
                })
                .TransitionTo(CreatingEmployee)
                .Publish(context => new CreateEmployeeCommand(
                    context.Instance.CorrelationId.ToString(),
                    context.Data.CandidateId,
                    context.Data.ContractType,
                    context.Data.StartDate,
                    context.Data.Salary
                ))
        );

        // Step 1: Employee created
        During(CreatingEmployee,
            When(EmployeeCreated)
                .Then(context => context.Instance.EmployeeId = context.Data.EmployeeId)
                .TransitionTo(GeneratingContract)
                .Publish(context => new GenerateContractCommand(
                    context.Instance.CorrelationId.ToString(),
                    context.Data.EmployeeId,
                    context.Instance.CandidateId
                )),
            When(EmployeeCreationFailed)
                .TransitionTo(Failed)
                .Publish(context => new CancelOfferCommand(
                    context.Instance.CorrelationId.ToString(),
                    context.Instance.CandidateId,
                    context.Data.Reason
                ))
        );

        // Step 2: Contract generated
        During(GeneratingContract,
            When(ContractGenerated)
                .Then(context => context.Instance.ContractPdfUrl = context.Data.ContractPdfUrl)
                .TransitionTo(SubmittingDpae)
                .Publish(context => new SubmitDpaeCommand(
                    context.Instance.CorrelationId.ToString(),
                    context.Instance.EmployeeId
                )),
            When(ContractGenerationFailed)
                .TransitionTo(Failed)
                .PublishAsync(context => CompensatePayrollAsync(context))
        );

        // Step 3: DPAE submitted
        During(SubmittingDpae,
            When(DpaeSubmitted)
                .Then(context => context.Instance.DpaeNumber = context.Data.DpaeNumber)
                .TransitionTo(EnrollingTraining)
                .Publish(context => new EnrollOnboardingCommand(
                    context.Instance.CorrelationId.ToString(),
                    context.Instance.EmployeeId
                ))
        );

        // Step 4: Training enrolled (final step)
        During(EnrollingTraining,
            When(OnboardingEnrolled)
                .Then(context =>
                {
                    context.Instance.CompletedAt = DateTime.UtcNow;
                })
                .TransitionTo(Completed)
                .Publish(context => new HiringSagaCompletedEvent(
                    context.Instance.CorrelationId.ToString(),
                    context.Instance.EmployeeId
                ))
        );

        // Timeout handling (48 hours)
        During(CreatingEmployee, GeneratingContract, SubmittingDpae, EnrollingTraining,
            When(Faulted)
                .TransitionTo(Failed)
                .PublishAsync(context => CompensateAllAsync(context))
        );

        SetCompletedWhenFinalized();
    }

    private async Task CompensatePayrollAsync(BehaviorContext<HiringSagaState> context)
    {
        if (!context.Instance.PayrollCompensated)
        {
            await context.Publish(new DeleteEmployeeCommand(
                context.Instance.CorrelationId.ToString(),
                context.Instance.EmployeeId
            ));
            context.Instance.PayrollCompensated = true;
        }
    }

    private async Task CompensateAllAsync(BehaviorContext<HiringSagaState> context)
    {
        // Compensate in reverse order
        if (!string.IsNullOrEmpty(context.Instance.ContractPdfUrl) && !context.Instance.DocumentCompensated)
        {
            await context.Publish(new DeleteContractCommand(
                context.Instance.CorrelationId.ToString(),
                context.Instance.ContractPdfUrl
            ));
            context.Instance.DocumentCompensated = true;
        }

        await CompensatePayrollAsync(context);

        await context.Publish(new CancelOfferCommand(
            context.Instance.CorrelationId.ToString(),
            context.Instance.CandidateId,
            "Saga timeout or failure"
        ));
    }
}
```

**Program.cs - Register MassTransit:**

```csharp
// SagaOrchestrator/Program.cs
using MassTransit;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddMassTransit(x =>
{
    x.AddSagaStateMachine<HiringSagaStateMachine, HiringSagaState>()
        .CosmosRepository(r =>
        {
            r.AccountEndpoint = builder.Configuration["CosmosDb:Endpoint"];
            r.AccountKey = builder.Configuration["CosmosDb:Key"];
            r.DatabaseId = "RH-OptimERP-Sagas";
        });

    x.UsingAzureServiceBus((context, cfg) =>
    {
        cfg.Host(builder.Configuration["ServiceBus:ConnectionString"]);

        cfg.ConfigureEndpoints(context);

        // Retry configuration
        cfg.UseMessageRetry(r => r.Exponential(5, TimeSpan.FromSeconds(1), TimeSpan.FromMinutes(5), TimeSpan.FromSeconds(2)));

        // Timeout configuration (48 hours)
        cfg.UseTimeout(x => x.Timeout = TimeSpan.FromHours(48));
    });
});

var app = builder.Build();
app.Run();
```

## French HR Compliance - DPAE Integration

**DPAE (Déclaration Préalable À l'Embauche):**
French law requires employers to declare new hires to URSSAF before their first day of work.

```csharp
// ComplianceService/Services/DpaeService.cs
using System.Net.Http.Json;

public interface IDpaeService
{
    Task<string> SubmitDpaeAsync(string employeeId);
}

public class DpaeService : IDpaeService
{
    private readonly HttpClient _httpClient;
    private readonly IEmployeeRepository _employeeRepository;
    private readonly ILogger<DpaeService> _logger;

    public DpaeService(HttpClient httpClient, IEmployeeRepository employeeRepository, ILogger<DpaeService> logger)
    {
        _httpClient = httpClient;
        _employeeRepository = employeeRepository;
        _logger = logger;
    }

    public async Task<string> SubmitDpaeAsync(string employeeId)
    {
        var employee = await _employeeRepository.GetByIdAsync(employeeId);
        if (employee == null)
            throw new InvalidOperationException($"Employee not found: {employeeId}");

        // Build DPAE payload (URSSAF API)
        var dpaeRequest = new
        {
            siret = "12345678901234",  // Company SIRET
            nom = employee.LastName,
            prenom = employee.FirstName,
            dateNaissance = employee.BirthDate.ToString("yyyy-MM-dd"),
            numeroSecuriteSociale = employee.SocialSecurityNumber,
            dateEmbauche = employee.StartDate.ToString("yyyy-MM-dd"),
            typeContrat = employee.ContractType,  // "CDI", "CDD", etc.
            heureEmbauche = "08:00"
        };

        try
        {
            // Call URSSAF DPAE API (production endpoint)
            var response = await _httpClient.PostAsJsonAsync(
                "https://api.urssaf.fr/partenaire/dpae/v1/declarations",
                dpaeRequest
            );

            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync();
                _logger.LogError("DPAE submission failed: {Error}", error);
                throw new DpaeSubmissionException($"URSSAF API error: {response.StatusCode}");
            }

            var dpaeResponse = await response.Content.ReadFromJsonAsync<DpaeResponse>();
            _logger.LogInformation("DPAE submitted successfully: {DpaeNumber}", dpaeResponse.NumeroDpae);

            return dpaeResponse.NumeroDpae;
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "DPAE submission network error");
            throw new DpaeSubmissionException("Network error during DPAE submission", ex);
        }
    }
}

public record DpaeResponse(string NumeroDpae, DateTime DateDeclaration);
public class DpaeSubmissionException : Exception
{
    public DpaeSubmissionException(string message) : base(message) { }
    public DpaeSubmissionException(string message, Exception inner) : base(message, inner) { }
}
```

## Testing Strategies

### Unit Tests (Saga State Machine)

```csharp
// Tests/HiringSagaStateMachineTests.cs
using MassTransit.Testing;
using Xunit;

public class HiringSagaStateMachineTests
{
    [Fact]
    public async Task Saga_HappyPath_CompletesSuccessfully()
    {
        await using var provider = new ServiceCollection()
            .AddMassTransitTestHarness(cfg =>
            {
                cfg.AddSagaStateMachine<HiringSagaStateMachine, HiringSagaState>()
                    .InMemoryRepository();
            })
            .BuildServiceProvider(true);

        var harness = provider.GetRequiredService<ITestHarness>();
        await harness.Start();

        var sagaId = Guid.NewGuid();

        // Step 1: Offer accepted
        await harness.Bus.Publish(new OfferAcceptedEvent(
            sagaId.ToString(),
            "candidate-123",
            "offer-456",
            "CDI",
            DateTime.UtcNow.AddDays(30),
            45000
        ));

        // Step 2: Employee created
        await harness.Bus.Publish(new EmployeeCreatedEvent(
            sagaId.ToString(),
            "employee-789",
            "candidate-123"
        ));

        // Step 3: Contract generated
        await harness.Bus.Publish(new ContractGeneratedEvent(
            sagaId.ToString(),
            "employee-789",
            "https://storage.blob.core.windows.net/contracts/contract-789.pdf"
        ));

        // Step 4: DPAE submitted
        await harness.Bus.Publish(new DpaeSubmittedEvent(
            sagaId.ToString(),
            "employee-789",
            "DPAE-2026-001234"
        ));

        // Step 5: Training enrolled
        await harness.Bus.Publish(new OnboardingEnrolledEvent(
            sagaId.ToString(),
            "employee-789",
            "training-onboarding-101"
        ));

        // Assert saga completed
        var sagaHarness = provider.GetRequiredService<ISagaStateMachineTestHarness<HiringSagaStateMachine, HiringSagaState>>();
        Assert.True(await sagaHarness.Consumed.Any<OfferAcceptedEvent>());
        Assert.True(await sagaHarness.Consumed.Any<OnboardingEnrolledEvent>());

        var instance = sagaHarness.Sagas.Contains(sagaId);
        Assert.NotNull(instance);
        Assert.Equal(sagaHarness.StateMachine.Completed.Name, instance.CurrentState);
    }

    [Fact]
    public async Task Saga_PayrollFailure_CompensatesAndCancelsOffer()
    {
        await using var provider = new ServiceCollection()
            .AddMassTransitTestHarness(cfg =>
            {
                cfg.AddSagaStateMachine<HiringSagaStateMachine, HiringSagaState>()
                    .InMemoryRepository();
            })
            .BuildServiceProvider(true);

        var harness = provider.GetRequiredService<ITestHarness>();
        await harness.Start();

        var sagaId = Guid.NewGuid();

        await harness.Bus.Publish(new OfferAcceptedEvent(
            sagaId.ToString(),
            "candidate-123",
            "offer-456",
            "CDI",
            DateTime.UtcNow.AddDays(30),
            45000
        ));

        await harness.Bus.Publish(new EmployeeCreationFailedEvent(
            sagaId.ToString(),
            "candidate-123",
            "Duplicate employee"
        ));

        // Assert compensation command published
        Assert.True(await harness.Published.Any<CancelOfferCommand>());

        var sagaHarness = provider.GetRequiredService<ISagaStateMachineTestHarness<HiringSagaStateMachine, HiringSagaState>>();
        var instance = sagaHarness.Sagas.Contains(sagaId);
        Assert.Equal(sagaHarness.StateMachine.Failed.Name, instance.CurrentState);
    }
}
```

### Integration Tests (End-to-End Saga)

```csharp
// Tests/HiringSagaIntegrationTests.cs
using Xunit;

[Collection("ServiceBus")]
public class HiringSagaIntegrationTests : IAsyncLifetime
{
    private readonly ServiceBusClient _serviceBusClient;

    public HiringSagaIntegrationTests()
    {
        _serviceBusClient = new ServiceBusClient(Environment.GetEnvironmentVariable("SERVICE_BUS_CONNECTION_STRING"));
    }

    [Fact]
    public async Task EndToEnd_HiringSaga_CompletesSuccessfully()
    {
        var sagaId = Guid.NewGuid();
        var sender = _serviceBusClient.CreateSender("offer-accepted-topic");

        var offerEvent = new OfferAcceptedEvent(
            sagaId.ToString(),
            "candidate-integration-test",
            "offer-integration-test",
            "CDI",
            DateTime.UtcNow.AddDays(30),
            50000
        );

        await sender.SendMessageAsync(new ServiceBusMessage(BinaryData.FromObjectAsJson(offerEvent)));

        // Wait for saga to complete (poll Cosmos DB)
        await Task.Delay(TimeSpan.FromSeconds(30));

        // Assert: Check saga state in Cosmos DB
        var cosmosClient = new CosmosClient(
            Environment.GetEnvironmentVariable("COSMOS_ENDPOINT"),
            Environment.GetEnvironmentVariable("COSMOS_KEY")
        );
        var container = cosmosClient.GetContainer("RH-OptimERP-Sagas", "HiringSaga");

        var query = container.GetItemQueryIterator<HiringSagaState>(
            $"SELECT * FROM c WHERE c.CorrelationId = '{sagaId}'"
        );
        var result = await query.ReadNextAsync();
        var saga = result.FirstOrDefault();

        Assert.NotNull(saga);
        Assert.Equal("Completed", saga.CurrentState);
        Assert.NotNull(saga.EmployeeId);
        Assert.NotNull(saga.DpaeNumber);
    }

    public Task InitializeAsync() => Task.CompletedTask;
    public async Task DisposeAsync() => await _serviceBusClient.DisposeAsync();
}
```

## Performance Considerations

**Saga Performance Targets:**
- Orchestration: <5s per saga (happy path)
- Compensation: <10s (reverse order)
- Throughput: >100 sagas/second
- State persistence: <50ms (Cosmos DB write)

**Optimization Tips:**
- Use Cosmos DB for saga state (low-latency)
- Batch event publishing (Azure Service Bus batching)
- Implement idempotency keys (prevent duplicate processing)
- Use correlation IDs for distributed tracing

## Related Skills
- `implement-event-sourcing` - Store saga events for audit trail
- `add-message-broker` - Configure RabbitMQ/Service Bus
- `implement-outbox-pattern` - Ensure atomic event publishing

## References
- [MassTransit Saga Documentation](https://masstransit.io/documentation/patterns/saga)
- [Saga Pattern (Chris Richardson)](https://microservices.io/patterns/data/saga.html)
- [Azure Service Bus Sagas](https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/saga/saga)
- [DPAE URSSAF API](https://www.urssaf.fr/portail/home/services-en-ligne/dpae.html)
