# .NET Testing Rules

## Framework
- xUnit for test framework
- FluentAssertions for assertions
- Moq or NSubstitute for mocking
- Testcontainers for integration tests

## Conventions
- Test class: {ClassName}Tests
- Test method: {Method}_{Scenario}_{ExpectedResult}
- Arrange-Act-Assert pattern
- One assertion per test (prefer)

## Coverage
- Minimum 80% on changed files
- 100% on public API methods
- Performance tests: <100ms for single entity operations

## CosmosDB Testing
- Use in-memory ConcurrentDictionary for unit tests
- Use CosmosDB emulator for integration tests
- Test partition key routing
