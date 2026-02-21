---
name: generate-api-docs
description: Generate API documentation automatically from code
argument-hint: [tool: swagger|redoc|postman] [stack: dotnet|node|python]
tags: [documentation, API, Swagger, OpenAPI, ReDoc, Postman]
---

# API Documentation Generation Guide

---

## .NET 8 (Swagger / Swashbuckle)

```bash
dotnet add package Swashbuckle.AspNetCore
```

```csharp
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Candidate Matching API",
        Version = "v1",
        Description = "API for matching candidates to job offers",
    });
    options.IncludeXmlComments(Path.Combine(AppContext.BaseDirectory, "Api.xml"));
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
    });
});

app.UseSwagger();
app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "v1"));
```

### XML Documentation

```csharp
/// <summary>Get candidate by ID</summary>
/// <param name="id">Candidate unique identifier</param>
/// <response code="200">Returns the candidate</response>
/// <response code="404">Candidate not found</response>
[HttpGet("{id}")]
[ProducesResponseType<CandidateDto>(200)]
[ProducesResponseType(404)]
public async Task<IActionResult> GetById(string id) { }
```

---

## Node.js (swagger-jsdoc)

```javascript
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const specs = swaggerJsdoc({
  definition: { openapi: '3.0.0', info: { title: 'API', version: '1.0.0' } },
  apis: ['./routes/*.js'],
});
app.use('/docs', swaggerUi.serve, swaggerUi.setup(specs));

/**
 * @openapi
 * /api/candidates/{id}:
 *   get:
 *     summary: Get candidate by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Success }
 */
router.get('/:id', getCandidate);
```

---

## Python / FastAPI (Built-in)

```python
app = FastAPI(title="Candidate API", version="1.0.0", docs_url="/docs", redoc_url="/redoc")

@app.get("/candidates/{id}", response_model=CandidateDto, summary="Get candidate by ID")
async def get_candidate(id: str):
    '''Retrieve a candidate by their unique identifier.'''
    pass
```

---

## ReDoc (Static Documentation)

```html
<redoc spec-url="/swagger/v1/swagger.json"></redoc>
<script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
```
