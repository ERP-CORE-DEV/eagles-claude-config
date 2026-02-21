---
name: implement-bdd-tests
description: Write BDD tests using Gherkin syntax (Given-When-Then)
argument-hint: [stack: dotnet|node|python] [framework: specflow|cucumber|behave]
tags: [testing, BDD, Gherkin, SpecFlow, Cucumber, Given-When-Then]
---

# BDD Testing Guide

BDD bridges business requirements and tests using Gherkin (Given-When-Then) syntax.

---

## .NET (SpecFlow / Reqnroll)

### Feature File

```gherkin
Feature: Candidate Matching
  As a recruiter
  I want to match candidates to job offers
  So that I find the best fit

  Scenario: Match candidate with exact skills
    Given a job offer requiring skills "C#, Azure, SQL"
    And a candidate with skills "C#, Azure, SQL, Docker"
    When I run the matching engine
    Then the match score should be greater than 0.8
    And the skill match should be "exact"

  Scenario Outline: Score varies by experience match
    Given a job requiring <required> years of experience
    And a candidate with <actual> years
    When I calculate the experience score
    Then the score should be <expected>

    Examples:
      | required | actual | expected |
      | 5        | 5      | 1.0      |
      | 5        | 3      | 0.6      |
      | 5        | 8      | 0.9      |
```

### Step Definitions

```csharp
[Binding]
public class MatchingSteps
{
    private JobOffer _jobOffer;
    private Candidate _candidate;
    private MatchResult _result;
    private readonly IMatchingService _service;

    public MatchingSteps(IMatchingService service) => _service = service;

    [Given("a job offer requiring skills {string}")]
    public void GivenJobWithSkills(string skills)
    {
        _jobOffer = new JobOffer { RequiredSkills = skills.Split(", ").ToList() };
    }

    [Given("a candidate with skills {string}")]
    public void GivenCandidateWithSkills(string skills)
    {
        _candidate = new Candidate { Skills = skills.Split(", ").ToList() };
    }

    [When("I run the matching engine")]
    public async Task WhenRunMatching()
    {
        _result = await _service.MatchAsync(_candidate, _jobOffer);
    }

    [Then("the match score should be greater than {double}")]
    public void ThenScoreGreaterThan(double threshold)
    {
        _result.Score.Should().BeGreaterThan(threshold);
    }
}
```

---

## JavaScript (Cucumber.js)

```bash
npm install --save-dev @cucumber/cucumber
```

```gherkin
# features/login.feature
Feature: User Login
  Scenario: Successful login
    Given I am on the login page
    When I enter email "user@example.com" and password "correct"
    Then I should be redirected to the dashboard
```

```typescript
import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';

Given('I am on the login page', async function() {
  await this.page.goto('/login');
});

When('I enter email {string} and password {string}', async function(email, password) {
  await this.page.fill('#email', email);
  await this.page.fill('#password', password);
  await this.page.click('button[type="submit"]');
});

Then('I should be redirected to the dashboard', async function() {
  await expect(this.page).toHaveURL('/dashboard');
});
```

---

## Python (Behave)

```python
# features/steps/matching.py
from behave import given, when, then

@given('a job requiring {skills}')
def step_given_job(context, skills):
    context.job = {'skills': skills.split(', ')}

@when('I run matching')
def step_when_match(context):
    context.result = matching_service.match(context.candidate, context.job)

@then('the score should be above {threshold:f}')
def step_then_score(context, threshold):
    assert context.result.score > threshold
```

---

## Best Practices

| Practice | Why |
|----------|-----|
| Write features with business stakeholders | Shared understanding |
| One scenario = one behavior | Keep focused |
| Use scenario outlines for data variations | Reduce duplication |
| Keep steps reusable | Build a step library |
