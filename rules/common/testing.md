# Testing Rules

- TDD when possible: RED (failing test) -> GREEN (minimal code) -> REFACTOR
- Minimum 80% coverage on changed files
- 100% coverage on public API methods
- .NET: xUnit + FluentAssertions + Moq/NSubstitute
- React: Jest + React Testing Library (not Enzyme)
- Test edge cases: null, empty, boundary values, negative numbers
- One assertion per test (prefer focused tests)
- Use Arrange-Act-Assert pattern
- Name tests: Method_Scenario_ExpectedResult
- Performance tests: single entity ops < 100ms
