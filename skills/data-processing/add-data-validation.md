---
name: add-data-validation
description: Add input data validation using FluentValidation, Zod, or Pydantic
argument-hint: [stack: dotnet|node|python] [library: fluentvalidation|zod|joi|pydantic]
tags: [validation, data-processing, input, FluentValidation, Zod, Pydantic, security]
---

# Data Validation Guide

Validate at system boundaries: API inputs, file imports, message payloads. Never trust external data.

---

## 1. .NET 8 (FluentValidation)

```bash
dotnet add package FluentValidation.AspNetCore
```

```csharp
public class CreateCandidateValidator : AbstractValidator<CreateCandidateDto>
{
    public CreateCandidateValidator()
    {
        RuleFor(x => x.FullName)
            .NotEmpty().WithMessage("Le nom complet est requis")
            .MaximumLength(200);

        RuleFor(x => x.Email)
            .NotEmpty().WithMessage("L'email est requis")
            .EmailAddress().WithMessage("Format d'email invalide");

        RuleFor(x => x.PhoneNumber)
            .Matches(@"^(\+33|0)[1-9](\d{2}){4}$")
            .When(x => !string.IsNullOrEmpty(x.PhoneNumber))
            .WithMessage("Format de telephone invalide (ex: +33612345678)");

        RuleFor(x => x.NationalId)
            .Matches(@"^[12]\d{2}(0[1-9]|1[0-2])\d{2}\d{3}\d{3}\d{2}$")
            .When(x => !string.IsNullOrEmpty(x.NationalId))
            .WithMessage("Format NIR invalide");

        RuleForEach(x => x.Skills).ChildRules(skill =>
        {
            skill.RuleFor(s => s.Name).NotEmpty().MaximumLength(100);
            skill.RuleFor(s => s.Level).InclusiveBetween(1, 5);
        });
    }
}

// Registration
builder.Services.AddValidatorsFromAssemblyContaining<CreateCandidateValidator>();

// Validation filter (auto-validate before controller action)
builder.Services.AddFluentValidationAutoValidation();
```

### Custom Validators

```csharp
public static class CustomValidators
{
    public static IRuleBuilderOptions<T, string> MustBeSiret<T>(this IRuleBuilder<T, string> builder)
        => builder.Matches(@"^\d{14}$").WithMessage("SIRET doit contenir 14 chiffres");

    public static IRuleBuilderOptions<T, string> MustBeFrenchPostalCode<T>(this IRuleBuilder<T, string> builder)
        => builder.Matches(@"^\d{5}$").WithMessage("Code postal invalide");
}
```

---

## 2. TypeScript (Zod)

```bash
npm install zod
```

```typescript
import { z } from 'zod';

const candidateSchema = z.object({
  fullName: z.string().min(1, 'Le nom est requis').max(200),
  email: z.string().email('Format email invalide'),
  phoneNumber: z.string()
    .regex(/^(\+33|0)[1-9](\d{2}){4}$/, 'Format telephone invalide')
    .optional(),
  skills: z.array(z.object({
    name: z.string().min(1).max(100),
    level: z.number().int().min(1).max(5),
  })).min(1, 'Au moins une competence requise'),
  contractType: z.enum(['CDI', 'CDD', 'INTERIM', 'STAGE']),
  salaryExpectation: z.number().positive().optional(),
});

type CreateCandidateDto = z.infer<typeof candidateSchema>;

// Usage in Express
app.post('/api/candidates', (req, res) => {
  const result = candidateSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      errors: result.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  // result.data is typed and validated
});
```

### React Hook Form + Zod

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

function CandidateForm() {
  const { register, handleSubmit, formState: { errors } } = useForm<CreateCandidateDto>({
    resolver: zodResolver(candidateSchema),
  });
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('fullName')} />
      {errors.fullName && <span>{errors.fullName.message}</span>}
    </form>
  );
}
```

---

## 3. Python (Pydantic)

```python
from pydantic import BaseModel, EmailStr, Field, field_validator
import re

class CreateCandidateDto(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=200)
    email: EmailStr
    phone_number: str | None = None
    skills: list[SkillDto] = Field(..., min_length=1)
    contract_type: Literal["CDI", "CDD", "INTERIM", "STAGE"]

    @field_validator("phone_number")
    @classmethod
    def validate_french_phone(cls, v: str | None) -> str | None:
        if v and not re.match(r"^(\+33|0)[1-9](\d{2}){4}$", v):
            raise ValueError("Format telephone invalide (ex: +33612345678)")
        return v

# FastAPI auto-validates
@app.post("/api/candidates")
async def create_candidate(dto: CreateCandidateDto):
    return await service.create(dto)  # dto is already validated
```

---

## Validation Strategy

| Layer | What to validate | Tool |
|-------|-----------------|------|
| API boundary | Shape, types, required fields, format | FluentValidation / Zod / Pydantic |
| Business logic | Domain rules, cross-field, uniqueness | Service layer |
| Database | Constraints, foreign keys, unique indexes | Schema constraints |
| Frontend | UX feedback (mirrors API validation) | Zod + React Hook Form |


## Note: Contexte RH Francais

La validation des donnees dans les systemes RH francais inclut : verification du format NIR (Numero de Securite Sociale), validation du SMIC minimum pour les contrats CDI/CDD, verification des codes postaux francais (5 chiffres), et conformite CNIL pour le traitement des donnees personnelles. Chaque candidat doit avoir un email valide et un numero de telephone au format francais (+33 ou 0X).
