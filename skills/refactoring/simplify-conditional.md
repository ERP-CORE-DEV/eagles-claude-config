---
name: simplify-conditional
description: Simplify complex conditional logic using guard clauses, pattern matching, and lookup tables
argument-hint: [technique: guard-clause|pattern-match|lookup-table|polymorphism|early-return]
tags: [refactoring, conditionals, clean-code, readability, cyclomatic-complexity]
---

# Simplify Conditional Logic Guide

High cyclomatic complexity makes code hard to read, test, and maintain. Target: max 10 per method.

---

## 1. Guard Clauses (Early Return)

### Before

```csharp
public decimal CalculateBonus(Employee emp)
{
    decimal bonus = 0;
    if (emp != null)
    {
        if (emp.IsActive)
        {
            if (emp.YearsOfService >= 1)
            {
                if (emp.PerformanceRating >= 3)
                {
                    bonus = emp.BaseSalary * 0.1m;
                    if (emp.YearsOfService >= 5)
                        bonus *= 1.5m;
                }
            }
        }
    }
    return bonus;
}
```

### After

```csharp
public decimal CalculateBonus(Employee emp)
{
    if (emp is null) return 0;
    if (!emp.IsActive) return 0;
    if (emp.YearsOfService < 1) return 0;
    if (emp.PerformanceRating < 3) return 0;

    var bonus = emp.BaseSalary * 0.1m;
    if (emp.YearsOfService >= 5) bonus *= 1.5m;
    return bonus;
}
```

---

## 2. Pattern Matching (.NET 8)

### Before

```csharp
public string GetContractLabel(string type)
{
    if (type == "CDI") return "Contrat a Duree Indeterminee";
    else if (type == "CDD") return "Contrat a Duree Determinee";
    else if (type == "INTERIM") return "Travail Temporaire";
    else if (type == "STAGE") return "Convention de Stage";
    else return "Type inconnu";
}
```

### After

```csharp
public string GetContractLabel(string type) => type switch
{
    "CDI" => "Contrat a Duree Indeterminee",
    "CDD" => "Contrat a Duree Determinee",
    "INTERIM" => "Travail Temporaire",
    "STAGE" => "Convention de Stage",
    _ => "Type inconnu"
};
```

### TypeScript Equivalent

```typescript
const contractLabels: Record<string, string> = {
  CDI: 'Contrat a Duree Indeterminee',
  CDD: 'Contrat a Duree Determinee',
  INTERIM: 'Travail Temporaire',
  STAGE: 'Convention de Stage',
};

const getContractLabel = (type: string): string => contractLabels[type] ?? 'Type inconnu';
```

---

## 3. Lookup Tables

### Before

```typescript
function getStatusColor(status: string): string {
  if (status === 'active') return '#10b981';
  if (status === 'pending') return '#f59e0b';
  if (status === 'rejected') return '#ef4444';
  if (status === 'interview') return '#3b82f6';
  if (status === 'offer') return '#8b5cf6';
  return '#6b7280';
}
```

### After

```typescript
const STATUS_COLORS: Record<string, string> = {
  active: '#10b981',
  pending: '#f59e0b',
  rejected: '#ef4444',
  interview: '#3b82f6',
  offer: '#8b5cf6',
};

const getStatusColor = (status: string): string => STATUS_COLORS[status] ?? '#6b7280';
```

---

## 4. Replace Conditional with Polymorphism

### Before

```csharp
public decimal CalculateLeave(Employee emp)
{
    if (emp.ContractType == "CDI")
        return 25 + (emp.YearsOfService > 10 ? 5 : 0);
    else if (emp.ContractType == "CDD")
        return Math.Round(2.5m * emp.MonthsWorked);
    else if (emp.ContractType == "INTERIM")
        return Math.Round(2.5m * emp.MonthsWorked * 1.1m); // 10% precarite
    else
        return 0;
}
```

### After

```csharp
public interface ILeaveCalculator
{
    decimal Calculate(Employee emp);
}

public class CdiLeaveCalculator : ILeaveCalculator
{
    public decimal Calculate(Employee emp) => 25 + (emp.YearsOfService > 10 ? 5 : 0);
}

public class CddLeaveCalculator : ILeaveCalculator
{
    public decimal Calculate(Employee emp) => Math.Round(2.5m * emp.MonthsWorked);
}

public class InterimLeaveCalculator : ILeaveCalculator
{
    public decimal Calculate(Employee emp) => Math.Round(2.5m * emp.MonthsWorked * 1.1m);
}
```

---

## 5. Null Coalescing and Optional Chaining

### TypeScript

```typescript
// Before
const name = candidate && candidate.profile && candidate.profile.firstName
  ? candidate.profile.firstName
  : 'Unknown';

// After
const name = candidate?.profile?.firstName ?? 'Unknown';
```

### C#

```csharp
// Before
string city = null;
if (candidate != null && candidate.Address != null)
    city = candidate.Address.City;
if (city == null) city = "Non renseigne";

// After
var city = candidate?.Address?.City ?? "Non renseigne";
```

---

## Complexity Thresholds

| Cyclomatic Complexity | Action |
|-----------------------|--------|
| 1-5 | Good — no action needed |
| 6-10 | Acceptable — consider simplifying |
| 11-20 | Refactor — extract methods or use patterns |
| 21+ | Critical — must decompose immediately |

## Measuring

```bash
# .NET
dotnet tool install -g dotnet-counters
# Use SonarCloud/SonarQube for cyclomatic complexity

# JavaScript
npx eslint --rule 'complexity: [error, 10]' src/

# Python
pip install radon
radon cc src/ -s -a
```
