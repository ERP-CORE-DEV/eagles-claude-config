---
name: implement-graphql
description: Implement GraphQL API with schema design, resolvers, pagination, and subscriptions
argument-hint: [stack: dotnet|node|python] [approach: schema-first|code-first]
tags: [api, graphql, schema, resolvers, subscriptions, federation]
---

# GraphQL Implementation Guide

GraphQL provides a flexible query language for APIs. Use when clients need to fetch complex, nested data with varying shapes.

---

## When to Use GraphQL vs REST

| Use GraphQL | Use REST |
|-------------|----------|
| Complex nested data (candidates + skills + experience) | Simple CRUD |
| Multiple client types (web, mobile, partner) | Single consumer |
| Avoid over-fetching/under-fetching | Cacheable resources |
| Real-time subscriptions needed | File uploads |

---

## 1. .NET 8 (HotChocolate)

### Setup

```bash
dotnet add package HotChocolate.AspNetCore
dotnet add package HotChocolate.Data
dotnet add package HotChocolate.Data.EntityFramework  # optional
```

### Schema (Code-First)

```csharp
// Types/CandidateType.cs
public class CandidateType : ObjectType<Candidate>
{
    protected override void Configure(IObjectTypeDescriptor<Candidate> descriptor)
    {
        descriptor.Field(c => c.Id).Type<NonNullType<IdType>>();
        descriptor.Field(c => c.FullName).Type<NonNullType<StringType>>();
        descriptor.Field(c => c.Skills).Type<NonNullType<ListType<NonNullType<ObjectType<Skill>>>>>();
        descriptor.Field("matchScore")
            .Argument("jobId", a => a.Type<NonNullType<IdType>>())
            .ResolveWith<CandidateResolvers>(r => r.GetMatchScore(default!, default!, default!));
    }
}

// Resolvers
public class CandidateResolvers
{
    public async Task<decimal> GetMatchScore(
        [Parent] Candidate candidate,
        [Argument] string jobId,
        [Service] IMatchingService matching)
        => await matching.CalculateScoreAsync(candidate.Id, jobId);
}
```

### Query Root

```csharp
public class Query
{
    [UseProjection]
    [UseFiltering]
    [UseSorting]
    public IQueryable<Candidate> GetCandidates([Service] ICandidateRepository repo)
        => repo.GetAll();

    public async Task<Candidate?> GetCandidateById(string id, [Service] ICandidateRepository repo)
        => await repo.GetByIdAsync(id);
}

// Program.cs
builder.Services
    .AddGraphQLServer()
    .AddQueryType<Query>()
    .AddMutationType<Mutation>()
    .AddSubscriptionType<Subscription>()
    .AddFiltering()
    .AddSorting()
    .AddProjections();

app.MapGraphQL();  // Endpoint: /graphql
```

### Cursor Pagination

```csharp
[UsePaging(MaxPageSize = 50, DefaultPageSize = 20, IncludeTotalCount = true)]
public IQueryable<Candidate> GetCandidates([Service] ICandidateRepository repo)
    => repo.GetAll().OrderBy(c => c.CreatedAt);
```

---

## 2. Node.js (Apollo Server)

### Setup

```bash
npm install @apollo/server graphql
```

### Schema-First

```typescript
const typeDefs = `#graphql
  type Candidate {
    id: ID!
    fullName: String!
    email: String!
    skills: [Skill!]!
    matchScore(jobId: ID!): Float
  }

  type Skill {
    id: ID!
    name: String!
    level: Int!
  }

  type CandidateConnection {
    edges: [CandidateEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type CandidateEdge {
    node: Candidate!
    cursor: String!
  }

  type PageInfo {
    hasNextPage: Boolean!
    endCursor: String
  }

  type Query {
    candidates(first: Int, after: String, filter: CandidateFilter): CandidateConnection!
    candidate(id: ID!): Candidate
  }

  input CandidateFilter {
    skills: [String!]
    minExperience: Int
    location: String
  }
`;

const resolvers = {
  Query: {
    candidates: async (_, { first = 20, after, filter }, { dataSources }) =>
      dataSources.candidateAPI.getCandidates({ first, after, filter }),
    candidate: async (_, { id }, { dataSources }) =>
      dataSources.candidateAPI.getById(id),
  },
  Candidate: {
    matchScore: async (candidate, { jobId }, { dataSources }) =>
      dataSources.matchingAPI.getScore(candidate.id, jobId),
    skills: async (candidate, _, { loaders }) =>
      loaders.skillLoader.loadMany(candidate.skillIds),  // DataLoader for N+1
  },
};
```

### DataLoader (N+1 Prevention)

```typescript
import DataLoader from 'dataloader';

const createLoaders = (dataSources) => ({
  skillLoader: new DataLoader(async (ids: string[]) => {
    const skills = await dataSources.skillAPI.getByIds(ids);
    return ids.map(id => skills.find(s => s.id === id));
  }),
});
```

---

## 3. Python (Strawberry)

```bash
pip install strawberry-graphql[fastapi]
```

```python
import strawberry
from strawberry.fastapi import GraphQLRouter

@strawberry.type
class Candidate:
    id: strawberry.ID
    full_name: str
    email: str

@strawberry.type
class Query:
    @strawberry.field
    async def candidates(self, info, first: int = 20, offset: int = 0) -> list[Candidate]:
        repo = info.context["candidate_repo"]
        return await repo.get_all(limit=first, offset=offset)

    @strawberry.field
    async def candidate(self, info, id: strawberry.ID) -> Candidate | None:
        return await info.context["candidate_repo"].get_by_id(id)

schema = strawberry.Schema(query=Query)
graphql_app = GraphQLRouter(schema)
app.include_router(graphql_app, prefix="/graphql")
```

---

## Security

```typescript
// Query depth limiting
import depthLimit from 'graphql-depth-limit';
const server = new ApolloServer({
  typeDefs, resolvers,
  validationRules: [depthLimit(5)],
});

// Query complexity analysis
import { createComplexityLimitRule } from 'graphql-validation-complexity';
validationRules: [createComplexityLimitRule(1000)];
```

---

## When NOT to Use GraphQL

| Scenario | Better alternative |
|----------|--------------------|
| Simple CRUD with 1 consumer | REST with OpenAPI |
| File upload/download | REST multipart |
| Server-to-server with fixed schema | gRPC |
| Public API with rate limiting | REST (easier to rate-limit) |
