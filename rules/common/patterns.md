# Architecture Pattern Rules

- Controller-Service-Repository pattern (NOT CQRS/MediatR)
- DTOs with static ToDomain() and FromDomain() methods
- Dependency injection via constructor (no service locator)
- IOptions<T> for configuration binding
- Repository returns domain models (not DTOs)
- Service layer handles business logic and validation
- Controller handles HTTP concerns only
- French HR domain: validate CPF, OPCO, RNCP codes
- Use PagedResult<T> for paginated responses
- Namespace: {Project}.{Layer}.{Feature}
