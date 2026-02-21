---
name: add-dto-mapping
description: Map between DTOs and domain models using AutoMapper or manual mapping
argument-hint: [approach: automapper|manual|mapster]
tags: [backend, dto, mapping, AutoMapper, Mapster, data-transfer]
---

# DTO Mapping Guide

DTOs decouple API contracts from domain models, allowing independent evolution.

---

## Manual Mapping (Recommended for Simple Cases)

### Static Factory Methods

```csharp
public class CandidateDto
{
    public string Id { get; set; }
    public string FullName { get; set; }
    public string Email { get; set; }
    public List<string> Skills { get; set; }

    public static CandidateDto FromDomain(Candidate entity) => new()
    {
        Id = entity.Id,
        FullName = $"{entity.FirstName} {entity.LastName}",
        Email = entity.Email,
        Skills = entity.Skills?.Select(s => s.Name).ToList() ?? new(),
    };

    public Candidate ToDomain() => new()
    {
        Id = Id,
        FirstName = FullName.Split(' ').FirstOrDefault() ?? "",
        LastName = FullName.Split(' ').LastOrDefault() ?? "",
        Email = Email,
    };
}
```

### Extension Methods

```csharp
public static class CandidateMappingExtensions
{
    public static CandidateDto ToDto(this Candidate entity) => new()
    {
        Id = entity.Id,
        FullName = $"{entity.FirstName} {entity.LastName}",
        Email = entity.Email,
    };

    public static List<CandidateDto> ToDtos(this IEnumerable<Candidate> entities)
        => entities.Select(e => e.ToDto()).ToList();
}
```

---

## AutoMapper (.NET)

```bash
dotnet add package AutoMapper.Extensions.Microsoft.DependencyInjection
```

```csharp
public class CandidateProfile : Profile
{
    public CandidateProfile()
    {
        CreateMap<Candidate, CandidateDto>()
            .ForMember(d => d.FullName, opt => opt.MapFrom(s => $"{s.FirstName} {s.LastName}"))
            .ForMember(d => d.Skills, opt => opt.MapFrom(s => s.Skills.Select(sk => sk.Name)));

        CreateMap<CreateCandidateDto, Candidate>()
            .ForMember(d => d.Id, opt => opt.Ignore())
            .ForMember(d => d.CreatedAt, opt => opt.Ignore());
    }
}

// Register
builder.Services.AddAutoMapper(typeof(Program).Assembly);

// Usage
public class CandidateService(IMapper mapper, ICandidateRepository repo)
{
    public async Task<CandidateDto> GetByIdAsync(string id)
    {
        var entity = await repo.GetByIdAsync(id);
        return mapper.Map<CandidateDto>(entity);
    }
}
```

---

## Mapster (Faster Alternative)

```bash
dotnet add package Mapster
```

```csharp
TypeAdapterConfig<Candidate, CandidateDto>.NewConfig()
    .Map(d => d.FullName, s => $"{s.FirstName} {s.LastName}");

var dto = candidate.Adapt<CandidateDto>();
var dtos = candidates.Adapt<List<CandidateDto>>();
```

---

## TypeScript

```typescript
function toCandidateDto(entity: Candidate): CandidateDto {
  return {
    id: entity.id,
    fullName: `${entity.firstName} ${entity.lastName}`,
    email: entity.email,
    skills: entity.skills.map(s => s.name),
  };
}

function fromCreateDto(dto: CreateCandidateDto): Omit<Candidate, 'id' | 'createdAt'> {
  const [firstName, ...rest] = dto.fullName.split(' ');
  return { firstName, lastName: rest.join(' '), email: dto.email };
}
```

---

## When to Use What

| Scenario | Approach |
|----------|----------|
| < 10 entities, simple mapping | Manual (extension methods) |
| 10-50 entities, conventions | AutoMapper or Mapster |
| Performance critical | Manual or Mapster (2-5x faster than AutoMapper) |
| Complex nested mapping | AutoMapper with profiles |
