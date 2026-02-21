---
name: remove-code-duplication
description: Remove code duplication following DRY principle
tags: [refactoring, dry, code-quality, patterns]
languages: [csharp, typescript, python]
complexity: intermediate
---

# Remove Code Duplication (DRY Principle)

Systematic guide for identifying and eliminating code duplication across C#, TypeScript, and Python codebases.

## 1. Duplication Types

### Type 1: Exact Clones
Identical code blocks copy-pasted verbatim. Easiest to detect and fix.

### Type 2: Parameterized Clones
Structurally identical code that differs only in variable names, literals, or constants.

### Type 3: Semantic Clones
Different syntax but equivalent behavior. Hardest to detect because the code looks different but does the same thing.

---

## 2. Identifying Duplication

**Signals to watch for:**
- Two or more methods with the same control flow but different field names
- Switch/case or if/else chains that repeat across files
- Similar validation logic in multiple controllers or services
- Copy-pasted data transformation with minor tweaks
- Repeated try/catch patterns with identical error handling

---

## 3. Extraction to Shared Methods and Classes

### C# -- Extract Common Validation

**Before (duplicated validation in two services):**

```csharp
// In CandidateService.cs
public async Task<Candidate> CreateCandidate(CandidateDto dto)
{
    if (string.IsNullOrWhiteSpace(dto.Email))
        throw new ValidationException("Email is required.");
    if (!Regex.IsMatch(dto.Email, @"^[^@\s]+@[^@\s]+\.[^@\s]+$"))
        throw new ValidationException("Email format is invalid.");
    if (string.IsNullOrWhiteSpace(dto.FirstName))
        throw new ValidationException("First name is required.");
    if (dto.FirstName.Length > 100)
        throw new ValidationException("First name must not exceed 100 characters.");

    // ... create logic
}

// In RecruiterService.cs
public async Task<Recruiter> CreateRecruiter(RecruiterDto dto)
{
    if (string.IsNullOrWhiteSpace(dto.Email))
        throw new ValidationException("Email is required.");
    if (!Regex.IsMatch(dto.Email, @"^[^@\s]+@[^@\s]+\.[^@\s]+$"))
        throw new ValidationException("Email format is invalid.");
    if (string.IsNullOrWhiteSpace(dto.FirstName))
        throw new ValidationException("First name is required.");
    if (dto.FirstName.Length > 100)
        throw new ValidationException("First name must not exceed 100 characters.");

    // ... create logic
}
```

**After (shared validator):**

```csharp
// Shared/Validators/PersonValidator.cs
public static class PersonValidator
{
    public static void ValidateContactInfo(string email, string firstName)
    {
        if (string.IsNullOrWhiteSpace(email))
            throw new ValidationException("Email is required.");
        if (!Regex.IsMatch(email, @"^[^@\s]+@[^@\s]+\.[^@\s]+$"))
            throw new ValidationException("Email format is invalid.");
        if (string.IsNullOrWhiteSpace(firstName))
            throw new ValidationException("First name is required.");
        if (firstName.Length > 100)
            throw new ValidationException("First name must not exceed 100 characters.");
    }
}

// In CandidateService.cs
public async Task<Candidate> CreateCandidate(CandidateDto dto)
{
    PersonValidator.ValidateContactInfo(dto.Email, dto.FirstName);
    // ... create logic
}

// In RecruiterService.cs
public async Task<Recruiter> CreateRecruiter(RecruiterDto dto)
{
    PersonValidator.ValidateContactInfo(dto.Email, dto.FirstName);
    // ... create logic
}
```

### TypeScript -- Extract Shared API Call Logic

**Before (duplicated fetch patterns):**

```typescript
// candidateApi.ts
export async function fetchCandidates(filters: CandidateFilters): Promise<Candidate[]> {
  try {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) params.append(key, String(value));
    });
    const response = await axios.get(`/api/candidates?${params}`);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      window.location.href = "/login";
    }
    throw error;
  }
}

// jobApi.ts
export async function fetchJobs(filters: JobFilters): Promise<Job[]> {
  try {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) params.append(key, String(value));
    });
    const response = await axios.get(`/api/jobs?${params}`);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      window.location.href = "/login";
    }
    throw error;
  }
}
```

**After (generic fetcher):**

```typescript
// shared/apiClient.ts
function buildQueryString(filters: Record<string, unknown>): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null) params.append(key, String(value));
  });
  return params.toString();
}

async function fetchWithAuth<T>(endpoint: string, filters: Record<string, unknown>): Promise<T> {
  try {
    const query = buildQueryString(filters);
    const response = await axios.get(`${endpoint}?${query}`);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      window.location.href = "/login";
    }
    throw error;
  }
}

// candidateApi.ts
export const fetchCandidates = (filters: CandidateFilters): Promise<Candidate[]> =>
  fetchWithAuth<Candidate[]>("/api/candidates", filters);

// jobApi.ts
export const fetchJobs = (filters: JobFilters): Promise<Job[]> =>
  fetchWithAuth<Job[]>("/api/jobs", filters);
```

### Python -- Extract Shared Data Transformation

**Before:**

```python
# reports/candidate_report.py
def generate_candidate_report(candidates: list[dict]) -> dict:
    total = len(candidates)
    if total == 0:
        return {"total": 0, "average_score": 0, "top_items": []}
    scores = [c["score"] for c in candidates]
    average = sum(scores) / total
    sorted_items = sorted(candidates, key=lambda x: x["score"], reverse=True)
    return {"total": total, "average_score": round(average, 2), "top_items": sorted_items[:10]}

# reports/job_report.py
def generate_job_report(jobs: list[dict]) -> dict:
    total = len(jobs)
    if total == 0:
        return {"total": 0, "average_score": 0, "top_items": []}
    scores = [j["score"] for j in jobs]
    average = sum(scores) / total
    sorted_items = sorted(jobs, key=lambda x: x["score"], reverse=True)
    return {"total": total, "average_score": round(average, 2), "top_items": sorted_items[:10]}
```

**After:**

```python
# reports/shared.py
def generate_scored_report(items: list[dict], score_field: str = "score", top_n: int = 10) -> dict:
    total = len(items)
    if total == 0:
        return {"total": 0, "average_score": 0, "top_items": []}
    scores = [item[score_field] for item in items]
    average = sum(scores) / total
    sorted_items = sorted(items, key=lambda x: x[score_field], reverse=True)
    return {"total": total, "average_score": round(average, 2), "top_items": sorted_items[:top_n]}

# reports/candidate_report.py
from reports.shared import generate_scored_report

def generate_candidate_report(candidates: list[dict]) -> dict:
    return generate_scored_report(candidates, score_field="score")
```

---

## 4. Template Method Pattern (Structural Duplication)

Use when subclasses share the same algorithm skeleton but override specific steps.

### C# Example

```csharp
// Base class defines the skeleton
public abstract class DocumentExporter
{
    public byte[] Export(IEnumerable<Record> records)
    {
        var filtered = ApplyFilters(records);
        var formatted = FormatRecords(filtered);
        var header = BuildHeader();
        return Serialize(header, formatted);
    }

    protected virtual IEnumerable<Record> ApplyFilters(IEnumerable<Record> records)
        => records.Where(r => r.IsActive);

    protected abstract IEnumerable<string[]> FormatRecords(IEnumerable<Record> records);
    protected abstract string BuildHeader();
    protected abstract byte[] Serialize(string header, IEnumerable<string[]> rows);
}

public class CsvExporter : DocumentExporter
{
    protected override IEnumerable<string[]> FormatRecords(IEnumerable<Record> records)
        => records.Select(r => new[] { r.Id.ToString(), r.Name, r.Date.ToString("yyyy-MM-dd") });

    protected override string BuildHeader() => "Id,Name,Date";

    protected override byte[] Serialize(string header, IEnumerable<string[]> rows)
    {
        var sb = new StringBuilder(header + "\n");
        foreach (var row in rows) sb.AppendLine(string.Join(",", row));
        return Encoding.UTF8.GetBytes(sb.ToString());
    }
}

public class ExcelExporter : DocumentExporter
{
    protected override IEnumerable<string[]> FormatRecords(IEnumerable<Record> records)
        => records.Select(r => new[] { r.Id.ToString(), r.Name, r.Date.ToString("dd/MM/yyyy") });

    protected override string BuildHeader() => "Identifiant\tNom\tDate";

    protected override byte[] Serialize(string header, IEnumerable<string[]> rows)
    {
        // Excel generation logic using a library like ClosedXML
        throw new NotImplementedException();
    }
}
```

---

## 5. Strategy Pattern (Behavioral Duplication)

Use when the same operation has multiple interchangeable implementations selected at runtime.

### TypeScript Example

```typescript
// strategy interface
interface ScoringStrategy {
  calculate(candidate: Candidate, job: JobRequirement): number;
}

// concrete strategies
class ExperienceScoringStrategy implements ScoringStrategy {
  calculate(candidate: Candidate, job: JobRequirement): number {
    const yearsRequired = job.minExperienceYears;
    const yearsActual = candidate.experienceYears;
    return Math.min(yearsActual / yearsRequired, 1.0);
  }
}

class SkillScoringStrategy implements ScoringStrategy {
  calculate(candidate: Candidate, job: JobRequirement): number {
    const matched = candidate.skills.filter(s => job.requiredSkills.includes(s));
    return matched.length / job.requiredSkills.length;
  }
}

class LocationScoringStrategy implements ScoringStrategy {
  calculate(candidate: Candidate, job: JobRequirement): number {
    if (candidate.city === job.city) return 1.0;
    if (candidate.region === job.region) return 0.7;
    if (candidate.acceptsRemote || job.isRemote) return 0.5;
    return 0.1;
  }
}

// context -- eliminates switch/case duplication
class MatchingEngine {
  constructor(private strategies: ScoringStrategy[]) {}

  score(candidate: Candidate, job: JobRequirement): number {
    const scores = this.strategies.map(s => s.calculate(candidate, job));
    return scores.reduce((sum, s) => sum + s, 0) / scores.length;
  }
}
```

### Python Example

```python
from abc import ABC, abstractmethod

class NotificationSender(ABC):
    @abstractmethod
    def send(self, recipient: str, message: str) -> bool: ...

class EmailSender(NotificationSender):
    def send(self, recipient: str, message: str) -> bool:
        # SMTP logic
        return True

class SmsSender(NotificationSender):
    def send(self, recipient: str, message: str) -> bool:
        # SMS API logic
        return True

class NotificationService:
    def __init__(self, senders: list[NotificationSender]):
        self._senders = senders

    def notify_all(self, recipient: str, message: str) -> list[bool]:
        return [sender.send(recipient, message) for sender in self._senders]
```

---

## 6. Shared Libraries and Packages

When duplication spans multiple projects or repositories, extract to a shared package.

### C# -- Shared NuGet Package

```
MyOrg.Shared.Validation/
  src/
    PersonValidator.cs
    AddressValidator.cs
    PhoneValidator.cs
  MyOrg.Shared.Validation.csproj
```

Reference in consuming projects:

```xml
<PackageReference Include="MyOrg.Shared.Validation" Version="1.2.0" />
```

### TypeScript -- Shared npm Package

```
@myorg/shared-utils/
  src/
    validation.ts
    formatting.ts
    api-client.ts
  package.json   // "name": "@myorg/shared-utils"
  tsconfig.json
```

Reference in consuming projects:

```json
{ "dependencies": { "@myorg/shared-utils": "^1.2.0" } }
```

### Python -- Shared Package

```
myorg-shared/
  myorg_shared/
    __init__.py
    validators.py
    formatters.py
  pyproject.toml
```

---

## 7. When NOT to Deduplicate

Not all duplication is harmful. Removing it can sometimes make code worse.

### Accidental Similarity
Two functions look alike today but serve unrelated business domains that will diverge independently. Forcing a shared abstraction couples them unnecessarily.

```python
# These look similar but belong to different bounded contexts.
# They WILL diverge as business rules change independently.

def calculate_candidate_score(candidate):
    return candidate.experience * 0.4 + candidate.skills * 0.6

def calculate_employee_performance(employee):
    return employee.experience * 0.4 + employee.skills * 0.6
```

Merging these into one function creates hidden coupling between recruitment and HR performance -- two separate domains with separate owners and separate evolution paths.

### Rule of Three
Do not extract on the first duplication. Wait until you see the same pattern at least three times. Two occurrences may still be coincidence; three confirms a real pattern.

### Test Code
Test files often contain deliberate repetition for clarity. Each test should be independently readable. Over-extracting test setup into shared helpers makes tests harder to understand and debug.

### Cross-Microservice Duplication
Duplicating a small DTO or value object across two microservices is often preferable to introducing a shared library dependency. The coupling cost of a shared package can outweigh the duplication cost for small, stable structures.

### Performance-Critical Paths
Inlining duplicated code can be faster than method call overhead in hot loops. Profile before abstracting performance-sensitive code.

---

## 8. Refactoring Checklist

1. **Scan** -- Search for duplicate blocks using IDE tools or jscpd, Simian, or PMD CPD.
2. **Classify** -- Determine if the duplication is Type 1 (exact), Type 2 (parameterized), or Type 3 (semantic).
3. **Assess risk** -- Check if the duplicates are in the same bounded context and likely to evolve together.
4. **Choose pattern** -- Extract method, Template Method, Strategy, or shared library.
5. **Extract** -- Move shared logic to the new location. Keep the original call sites as thin wrappers.
6. **Test** -- Run existing tests to confirm behavior is preserved. Add tests for the extracted code.
7. **Review** -- Verify that the abstraction is clearer than the duplication it replaced.

---

## 9. Detection Tools

| Language   | Tool                        | Purpose                             |
|------------|-----------------------------|-------------------------------------|
| C#         | ReSharper / Rider            | IDE-based clone detection           |
| TypeScript | jscpd                        | Copy-paste detector (multi-lang)    |
| Python     | pylint duplicate-code        | Built-in duplicate checker          |
| Any        | SonarQube / SonarCloud       | Cross-language duplication metrics  |
| Any        | PMD CPD                      | Token-based clone detection         |

---

## 10. Key Principles

- **DRY applies to knowledge, not just code.** Two identical lines expressing different business rules are not duplication.
- **Prefer composition over inheritance** when eliminating behavioral duplication.
- **Name the abstraction well.** If you cannot find a good name for the extracted function, the duplication may be accidental.
- **Keep extracted code at the right level.** Shared utilities belong in a Shared/ or Common/ folder. Domain logic stays in the domain layer.
- **Measure improvement.** Track lines of code, cyclomatic complexity, and test coverage before and after refactoring.


## Note: Contexte RH Francais

Dans les systemes RH francais comme RH-OptimERP, la duplication de code est courante pour la validation des donnees (NIR, SMIC, contrats). Centraliser ces validations dans des services partages plutot que de dupliquer la logique dans chaque microservice. La validation du NIR (Numero de Securite Sociale) et les calculs SMIC doivent etre factorises dans un module commun.
