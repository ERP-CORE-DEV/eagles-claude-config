---
name: write-code-comments
description: Write clear, helpful code comments and documentation
argument-hint: [style: jsdoc|xmldoc|docstring|inline]
tags: [code-review, comments, documentation, JSDoc, XMLDoc, docstrings]
---

# Code Comments Guide

Good comments explain WHY, not WHAT. The code tells you what; comments tell you why.

---

## When to Comment

| Comment When | Don't Comment When |
|-------------|-------------------|
| Business rule not obvious from code | Code is self-explanatory |
| Workaround for known issue | Restating what the code does |
| Performance optimization reason | Obvious getter/setter |
| Regex explanation | Simple CRUD operation |
| TODO with ticket reference | Commented-out code (delete it) |

---

## JSDoc (JavaScript/TypeScript)

```typescript
/**
 * Calculate weighted match score between a candidate and job offer.
 *
 * Uses a multi-factor scoring algorithm that weighs skills (50%),
 * experience (30%), and location (20%). Scores are normalized to 0-1.
 *
 * @param candidate - The candidate to evaluate
 * @param jobOffer - The target job offer
 * @param options - Optional scoring configuration
 * @returns Match result with overall score and per-factor breakdown
 * @throws {ValidationError} If candidate or job offer is incomplete
 *
 * @example
 * const result = await calculateMatchScore(candidate, job);
 * console.log(result.score); // 0.85
 */
async function calculateMatchScore(
  candidate: Candidate,
  jobOffer: JobOffer,
  options?: ScoringOptions,
): Promise<MatchResult> { }
```

---

## XML Documentation (.NET)

```csharp
/// <summary>
/// Calculates the experience match score between a candidate and job requirements.
/// </summary>
/// <remarks>
/// Uses a bell curve scoring model where exact experience match scores 1.0,
/// and deviation in either direction reduces the score proportionally.
/// Over-qualified candidates (>150% of required) are penalized slightly
/// to favor exact matches.
/// </remarks>
/// <param name="candidateYears">Candidate's years of relevant experience</param>
/// <param name="requiredYears">Job's required years of experience</param>
/// <returns>Score between 0.0 and 1.0</returns>
public double CalculateExperienceScore(int candidateYears, int requiredYears)
```

---

## Python Docstrings

```python
def calculate_match_score(candidate: Candidate, job: JobOffer) -> MatchResult:
    """Calculate weighted match score between candidate and job offer.

    Uses multi-factor scoring: skills (50%), experience (30%), location (20%).

    Args:
        candidate: The candidate to evaluate.
        job: The target job offer with requirements.

    Returns:
        MatchResult with overall score (0-1) and per-factor breakdown.

    Raises:
        ValidationError: If candidate or job data is incomplete.

    Example:
        >>> result = calculate_match_score(candidate, job)
        >>> result.score
        0.85
    """
```

---

## Inline Comments

```typescript
// French labor law requires minimum 11 hours rest between shifts (Art. L3131-1)
if (hoursSinceLastShift < 11) {
  throw new LaborLawViolationError('Repos insuffisant entre deux postes');
}

// HACK: CosmosDB returns TimeSpan as ISO 8601 duration string instead of seconds.
// See: https://github.com/Azure/azure-cosmos-dotnet/issues/1234
const seconds = parseDuration(response.duration).totalSeconds;
```
