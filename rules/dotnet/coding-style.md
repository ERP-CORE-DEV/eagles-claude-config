# .NET Coding Style Rules

## Naming
- PascalCase for public members, types, namespaces
- camelCase for private fields (prefix with _)
- IInterface prefix for interfaces
- Async suffix for async methods

## Patterns
- Controller-Service-Repository (NOT CQRS)
- DTOs with static ToDomain() and FromDomain()
- Constructor injection (no service locator)
- IOptions<T> for configuration

## CosmosDB
- Always specify partition key in queries
- Use SDK 3.54 direct (NOT EF Core)
- Monitor RU consumption per operation
- Use point reads over queries when possible

## French HR Domain
- SMIC validation on salary fields
- CDI/CDD/CDIC contract type enum
- CPF eligibility checks
- OPCO financing code validation
- RNCP/RS certification codes
