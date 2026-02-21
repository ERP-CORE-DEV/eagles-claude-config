---
name: create-mocks
description: Create test mocks and stubs for dependencies
argument-hint: [stack: dotnet|node|python] [library: moq|nsubstitute|jest|pytest]
tags: [testing, mocks, stubs, Moq, jest, unit-testing]
---

# Test Mocking Guide

Mocks replace real dependencies with controlled test doubles to isolate the system under test.

---

## .NET (Moq)

```csharp
// Mock repository
var mockRepo = new Mock<ICandidateRepository>();
mockRepo.Setup(r => r.GetByIdAsync("123"))
    .ReturnsAsync(new Candidate { Id = "123", FullName = "Jean Dupont" });
mockRepo.Setup(r => r.GetAllAsync())
    .ReturnsAsync(new List<Candidate> { new() { Id = "1" }, new() { Id = "2" } });

// Mock with callback
mockRepo.Setup(r => r.CreateAsync(It.IsAny<Candidate>()))
    .ReturnsAsync((Candidate c) => { c.Id = Guid.NewGuid().ToString(); return c; });

// Inject into service
var service = new CandidateService(mockRepo.Object, Mock.Of<ILogger<CandidateService>>());
var result = await service.GetByIdAsync("123");
Assert.Equal("Jean Dupont", result.FullName);

// Verify interactions
mockRepo.Verify(r => r.GetByIdAsync("123"), Times.Once);
mockRepo.Verify(r => r.DeleteAsync(It.IsAny<string>()), Times.Never);
```

### NSubstitute (Alternative)

```csharp
var repo = Substitute.For<ICandidateRepository>();
repo.GetByIdAsync("123").Returns(new Candidate { Id = "123" });
await repo.Received(1).GetByIdAsync("123");
```

---

## JavaScript (Jest)

```typescript
// Auto-mock module
jest.mock('./candidateService');

// Manual mock
const mockFetch = jest.fn().mockResolvedValue({ data: [{ id: '1', name: 'Test' }] });
const service = new CandidateService({ fetch: mockFetch } as any);

// Spy on existing method
const spy = jest.spyOn(service, 'validate');
spy.mockReturnValue(true);

// Verify
expect(mockFetch).toHaveBeenCalledWith('/api/candidates', expect.objectContaining({ method: 'GET' }));
expect(mockFetch).toHaveBeenCalledTimes(1);

// Mock implementation
jest.spyOn(Date, 'now').mockReturnValue(1234567890);
```

### MSW (API Mocking)

```typescript
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

const server = setupServer(
  http.get('/api/candidates', () => HttpResponse.json({ data: [{ id: '1' }] })),
  http.post('/api/candidates', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({ data: { id: '99', ...body } }, { status: 201 });
  }),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

---

## Python (pytest-mock / unittest.mock)

```python
from unittest.mock import AsyncMock, MagicMock, patch

@patch('services.candidate_service.CandidateRepository')
async def test_get_candidate(mock_repo):
    mock_repo.get_by_id = AsyncMock(return_value=Candidate(id="123", name="Test"))
    service = CandidateService(mock_repo)
    result = await service.get_by_id("123")
    assert result.name == "Test"
    mock_repo.get_by_id.assert_called_once_with("123")
```

---

## Best Practices

| Practice | Why |
|----------|-----|
| Mock at boundaries only | Don't mock internals of the SUT |
| Prefer stubs over mocks | Verify state, not interactions |
| Use real objects when cheap | Mocking simple objects adds noise |
| Reset mocks between tests | Prevent test pollution |
