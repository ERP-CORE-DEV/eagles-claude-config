---
name: add-api-documentation
description: Generate OpenAPI/Swagger documentation for REST APIs
---

# Add API Documentation

Generate comprehensive OpenAPI/Swagger documentation for REST APIs across .NET 8, Node.js, and Python stacks. Covers OpenAPI 3.1 spec structure, schema definitions, example requests/responses, authentication documentation, and alternative renderers like Redoc.

## OpenAPI 3.1 Spec Structure

Every OpenAPI document follows this top-level structure:

```yaml
openapi: "3.1.0"
info:
  title: My API
  version: 1.0.0
  description: Full API description with markdown support.
  contact:
    name: API Support
    email: support@example.com
  license:
    name: MIT
servers:
  - url: https://api.example.com/v1
    description: Production
  - url: https://staging-api.example.com/v1
    description: Staging
paths:
  /resources:
    get:
      summary: List resources
      operationId: listResources
      tags: [Resources]
      parameters:
        - name: page
          in: query
          schema:
            type: integer
            default: 1
        - name: pageSize
          in: query
          schema:
            type: integer
            default: 20
            maximum: 100
      responses:
        "200":
          description: Paginated list of resources
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/PagedResourceResponse"
              examples:
                default:
                  $ref: "#/components/examples/ResourceListExample"
        "401":
          $ref: "#/components/responses/Unauthorized"
components:
  schemas: {}
  securitySchemes: {}
  responses: {}
  examples: {}
security:
  - BearerAuth: []
tags:
  - name: Resources
    description: Operations on resources
```

## Schema Definitions

Define reusable schemas under `components/schemas`. Use `$ref` to avoid duplication.

```yaml
components:
  schemas:
    Resource:
      type: object
      required: [id, name, createdAt]
      properties:
        id:
          type: string
          format: uuid
          readOnly: true
        name:
          type: string
          minLength: 1
          maxLength: 255
        description:
          type: string
          nullable: true
        status:
          type: string
          enum: [active, inactive, archived]
          default: active
        createdAt:
          type: string
          format: date-time
          readOnly: true
    CreateResourceRequest:
      type: object
      required: [name]
      properties:
        name:
          type: string
          minLength: 1
          maxLength: 255
        description:
          type: string
    PagedResourceResponse:
      type: object
      properties:
        items:
          type: array
          items:
            $ref: "#/components/schemas/Resource"
        totalCount:
          type: integer
        page:
          type: integer
        pageSize:
          type: integer
    ErrorResponse:
      type: object
      properties:
        code:
          type: string
        message:
          type: string
        details:
          type: array
          items:
            type: object
            properties:
              field:
                type: string
              message:
                type: string
```

## Example Requests and Responses

Place examples alongside schemas or in the `components/examples` section for reuse.

```yaml
components:
  examples:
    ResourceListExample:
      summary: A typical page of resources
      value:
        items:
          - id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
            name: "Widget Alpha"
            status: "active"
            createdAt: "2026-01-15T10:30:00Z"
        totalCount: 42
        page: 1
        pageSize: 20
    CreateResourceExample:
      summary: Create a new resource
      value:
        name: "Widget Beta"
        description: "A second widget for testing"
```

Reference them in path operations:

```yaml
paths:
  /resources:
    post:
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateResourceRequest"
            examples:
              basic:
                $ref: "#/components/examples/CreateResourceExample"
```

## Authentication Documentation

Define security schemes under `components/securitySchemes` and apply them globally or per-operation.

```yaml
components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: "Obtain a token from POST /auth/token"
    ApiKeyAuth:
      type: apiKey
      in: header
      name: X-API-Key
    OAuth2:
      type: oauth2
      flows:
        authorizationCode:
          authorizationUrl: https://auth.example.com/authorize
          tokenUrl: https://auth.example.com/token
          scopes:
            read: Read access
            write: Write access
            admin: Admin access

# Global security (all endpoints require BearerAuth by default)
security:
  - BearerAuth: []

# Override per-operation (public endpoint)
paths:
  /health:
    get:
      security: []   # No auth required
```

## Shared Error Responses

Define reusable error responses to avoid repetition across paths.

```yaml
components:
  responses:
    Unauthorized:
      description: Authentication credentials are missing or invalid
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/ErrorResponse"
          example:
            code: "UNAUTHORIZED"
            message: "Bearer token is missing or expired"
    NotFound:
      description: The requested resource was not found
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/ErrorResponse"
          example:
            code: "NOT_FOUND"
            message: "Resource with the given ID does not exist"
    ValidationError:
      description: Request body failed validation
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/ErrorResponse"
          example:
            code: "VALIDATION_ERROR"
            message: "One or more fields failed validation"
            details:
              - field: "name"
                message: "Name is required"
```

---

## .NET 8 Implementation

### Swashbuckle.AspNetCore with XML Comments

Install the package:

```bash
dotnet add package Swashbuckle.AspNetCore --version 6.9.0
```

Enable XML documentation in your `.csproj`:

```xml
<PropertyGroup>
  <GenerateDocumentationFile>true</GenerateDocumentationFile>
  <NoWarn>$(NoWarn);1591</NoWarn>
</PropertyGroup>
```

Configure in `Program.cs`:

```csharp
using Microsoft.OpenApi.Models;
using System.Reflection;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "My API",
        Version = "v1",
        Description = "Full API description with markdown support.",
        Contact = new OpenApiContact
        {
            Name = "API Support",
            Email = "support@example.com"
        }
    });

    // Include XML comments from the build output
    var xmlFilename = $"{Assembly.GetExecutingAssembly().GetName().Name}.xml";
    options.IncludeXmlComments(Path.Combine(AppContext.BaseDirectory, xmlFilename));

    // JWT Bearer authentication
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "Enter the JWT token",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT"
    });

    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

var app = builder.Build();

app.UseSwagger();
app.UseSwaggerUI(options =>
{
    options.SwaggerEndpoint("/swagger/v1/swagger.json", "My API v1");
    options.RoutePrefix = string.Empty; // Serve Swagger UI at root
});

app.Run();
```

Annotate controllers with XML comments and attributes:

```csharp
/// <summary>
/// Manages resources in the system.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class ResourcesController : ControllerBase
{
    /// <summary>
    /// Retrieves a paginated list of resources.
    /// </summary>
    /// <param name="page">Page number (default: 1)</param>
    /// <param name="pageSize">Items per page (default: 20, max: 100)</param>
    /// <returns>A paginated list of resources</returns>
    /// <response code="200">Returns the paginated list</response>
    /// <response code="401">If the caller is not authenticated</response>
    [HttpGet]
    [ProducesResponseType(typeof(PagedResult<ResourceDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetAll(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        // implementation
    }

    /// <summary>
    /// Creates a new resource.
    /// </summary>
    /// <param name="request">The resource creation payload</param>
    /// <returns>The newly created resource</returns>
    /// <response code="201">Resource created successfully</response>
    /// <response code="400">Validation failed</response>
    [HttpPost]
    [ProducesResponseType(typeof(ResourceDto), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Create([FromBody] CreateResourceRequest request)
    {
        // implementation
    }
}
```

### NSwag Alternative

Install the package:

```bash
dotnet add package NSwag.AspNetCore --version 14.2.0
```

Configure in `Program.cs` (replace Swashbuckle section):

```csharp
using NSwag;
using NSwag.Generation.Processors.Security;

builder.Services.AddOpenApiDocument(config =>
{
    config.Title = "My API";
    config.Version = "v1";
    config.Description = "Full API description.";
    config.AddSecurity("Bearer", new OpenApiSecurityScheme
    {
        Type = OpenApiSecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        Description = "Enter your JWT token"
    });
    config.OperationProcessors.Add(
        new AspNetCoreOperationSecurityScopeProcessor("Bearer"));
});

// In the middleware pipeline
app.UseOpenApi();       // Serves /swagger/v1/swagger.json
app.UseSwaggerUi();     // Serves Swagger UI
app.UseReDoc(options =>  // Serves ReDoc at /redoc
{
    options.Path = "/redoc";
});
```

NSwag can also generate typed API clients:

```bash
# Generate a C# client from the running API
nswag openapi2csclient /input:https://localhost:5001/swagger/v1/swagger.json /output:ApiClient.cs /namespace:MyApp.Client

# Generate a TypeScript client
nswag openapi2tsclient /input:https://localhost:5001/swagger/v1/swagger.json /output:apiClient.ts
```

---

## Node.js Implementation

### swagger-jsdoc + swagger-ui-express

```bash
npm install swagger-jsdoc swagger-ui-express
npm install -D @types/swagger-jsdoc @types/swagger-ui-express  # if using TypeScript
```

Configure in your Express app:

```javascript
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const swaggerOptions = {
  definition: {
    openapi: "3.1.0",
    info: {
      title: "My API",
      version: "1.0.0",
      description: "Full API description with markdown support.",
    },
    servers: [
      { url: "http://localhost:3000", description: "Local" },
      { url: "https://api.example.com", description: "Production" },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [{ BearerAuth: [] }],
  },
  apis: ["./src/routes/*.js", "./src/routes/*.ts"],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get("/api-docs.json", (req, res) => res.json(swaggerSpec));
```

Annotate route files with JSDoc comments:

```javascript
/**
 * @openapi
 * /api/resources:
 *   get:
 *     summary: List resources
 *     tags: [Resources]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Paginated list of resources
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PagedResourceResponse'
 *       401:
 *         description: Unauthorized
 */
router.get("/api/resources", resourceController.getAll);

/**
 * @openapi
 * components:
 *   schemas:
 *     Resource:
 *       type: object
 *       required: [id, name]
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *         status:
 *           type: string
 *           enum: [active, inactive, archived]
 */
```

---

## Python Implementation

### FastAPI (Automatic Documentation)

FastAPI generates OpenAPI docs automatically from type hints:

```python
from fastapi import FastAPI, Query, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime

app = FastAPI(
    title="My API",
    version="1.0.0",
    description="Full API description with markdown support.",
    openapi_url="/api/openapi.json",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

security = HTTPBearer()

class Resource(BaseModel):
    id: UUID = Field(..., description="Unique identifier",
                     json_schema_extra={"readOnly": True})
    name: str = Field(..., min_length=1, max_length=255,
                      description="Resource name")
    description: str | None = Field(None, description="Optional description")
    status: str = Field("active", description="Current status",
                        json_schema_extra={"enum": ["active", "inactive", "archived"]})
    created_at: datetime = Field(..., description="Creation timestamp",
                                 json_schema_extra={"readOnly": True})

    model_config = {
        "json_schema_extra": {
            "examples": [{
                "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "name": "Widget Alpha",
                "status": "active",
                "created_at": "2026-01-15T10:30:00Z"
            }]
        }
    }

class CreateResourceRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None

class PagedResponse(BaseModel):
    items: list[Resource]
    total_count: int
    page: int
    page_size: int

@app.get(
    "/api/resources",
    response_model=PagedResponse,
    summary="List resources",
    tags=["Resources"],
    responses={401: {"description": "Unauthorized"}},
)
async def list_resources(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    pass

@app.post(
    "/api/resources",
    response_model=Resource,
    status_code=201,
    summary="Create a resource",
    tags=["Resources"],
    responses={400: {"description": "Validation error"}},
)
async def create_resource(
    request: CreateResourceRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    pass
```

### Flask-RESTX

```bash
pip install flask-restx
```

```python
from flask import Flask
from flask_restx import Api, Resource, fields, Namespace

app = Flask(__name__)
api = Api(
    app,
    version="1.0.0",
    title="My API",
    description="Full API description.",
    doc="/api-docs",
    authorizations={
        "Bearer": {
            "type": "apiKey",
            "in": "header",
            "name": "Authorization",
            "description": "Enter: Bearer <token>",
        }
    },
    security="Bearer",
)

ns = Namespace("resources", description="Resource operations")

resource_model = ns.model("Resource", {
    "id": fields.String(readonly=True, description="Unique identifier"),
    "name": fields.String(required=True, description="Resource name",
                          min_length=1, max_length=255),
    "status": fields.String(description="Status",
                            enum=["active", "inactive", "archived"]),
    "created_at": fields.DateTime(readonly=True,
                                   description="Creation timestamp"),
})

create_model = ns.model("CreateResource", {
    "name": fields.String(required=True, description="Resource name"),
    "description": fields.String(description="Optional description"),
})

@ns.route("/")
class ResourceList(Resource):
    @ns.doc("list_resources")
    @ns.marshal_list_with(resource_model)
    @ns.param("page", "Page number", type=int, default=1)
    @ns.param("pageSize", "Items per page", type=int, default=20)
    def get(self):
        pass

    @ns.doc("create_resource")
    @ns.expect(create_model, validate=True)
    @ns.marshal_with(resource_model, code=201)
    @ns.response(400, "Validation error")
    def post(self):
        pass

api.add_namespace(ns, path="/api/resources")
```

---

## Redoc as an Alternative Renderer

Redoc provides a three-panel, responsive documentation layout. It reads the same OpenAPI spec.

### Standalone HTML (any stack)

```html
<!DOCTYPE html>
<html>
<head>
  <title>API Documentation</title>
  <meta charset="utf-8"/>
  <link href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700"
        rel="stylesheet">
</head>
<body>
  <redoc spec-url="/swagger/v1/swagger.json"
         hide-download-button="false">
  </redoc>
  <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
</body>
</html>
```

### .NET 8 with Swashbuckle

```bash
dotnet add package Swashbuckle.AspNetCore.ReDoc
```

```csharp
app.UseReDoc(options =>
{
    options.SpecUrl("/swagger/v1/swagger.json");
    options.RoutePrefix = "docs";
    options.DocumentTitle = "API Documentation";
});
```

### Node.js with redoc-express

```bash
npm install redoc-express
```

```javascript
import redoc from "redoc-express";

app.get("/docs", redoc({
  title: "API Documentation",
  specUrl: "/api-docs.json",
  redocOptions: { hideDownloadButton: false },
}));
```

---

## API Changelog

Maintain a changelog for API consumers. Track breaking changes, deprecations, and new endpoints.

### Recommended format (CHANGELOG-API.md)

```markdown
# API Changelog

## [1.2.0] - 2026-02-01
### Added
- GET /api/resources/id/history - Retrieve audit history for a resource
- status filter parameter on GET /api/resources

### Changed
- GET /api/resources now returns totalCount instead of total
  (non-breaking: old field still present until v2.0)

### Deprecated
- GET /api/resources?sort=name - Use sortBy=name&sortOrder=asc instead.
  Will be removed in v2.0.

## [1.1.0] - 2026-01-15
### Added
- PATCH /api/resources/id - Partial update support
- Rate limiting headers (X-RateLimit-Limit, X-RateLimit-Remaining)

### Fixed
- POST /api/resources now returns 409 instead of 500 for duplicate names

## [1.0.0] - 2026-01-01
### Added
- Initial release with CRUD operations for Resources
- JWT Bearer authentication
- Pagination support on list endpoints
```

### Embedding changelog in OpenAPI spec

Use the `info.description` field with markdown to embed the latest changes directly:

```yaml
info:
  title: My API
  version: 1.2.0
  description: |
    ## Recent Changes (v1.2.0)
    - Added GET /api/resources/id/history
    - Added status filter on list endpoint
    - Deprecated sort parameter in favor of sortBy + sortOrder

    See [full changelog](/docs/changelog) for history.
```

### Versioning strategies

| Strategy | URL Example | Pros | Cons |
|----------|-------------|------|------|
| URL path | /v1/resources | Clear, easy to route | URL pollution |
| Header | Accept: application/vnd.api.v1+json | Clean URLs | Hidden, harder to test |
| Query param | /resources?api-version=1.0 | Easy to add | Can be forgotten |

For .NET 8, use `Asp.Versioning.Http`:

```bash
dotnet add package Asp.Versioning.Http
dotnet add package Asp.Versioning.Mvc.ApiExplorer
```

```csharp
builder.Services.AddApiVersioning(options =>
{
    options.DefaultApiVersion = new ApiVersion(1, 0);
    options.AssumeDefaultVersionWhenUnspecified = true;
    options.ReportApiVersions = true;
}).AddApiExplorer(options =>
{
    options.GroupNameFormat = "'v'VVV";
    options.SubstituteApiVersionInUrl = true;
});
```

---

## Key Points

- **Spec-first vs code-first**: Spec-first (write OpenAPI YAML, then generate code) ensures consistency. Code-first (annotate code, generate spec) is faster for rapid iteration. Choose based on team size and API stability.
- **Validation**: Use tools like `spectral` or `swagger-cli validate` to lint your OpenAPI spec in CI.
- **Always include examples**: Consumers rely on examples more than schema definitions. Provide realistic data.
- **Authentication docs are mandatory**: Never ship API docs without documenting how to authenticate.
- **Keep schemas DRY**: Use `$ref` extensively. Extract common patterns (pagination, errors) into reusable components.
- **Deprecation workflow**: Mark deprecated fields with `deprecated: true` in the schema. Announce removal timelines in the changelog.
- **Performance**: For large specs, consider splitting into multiple files and using `$ref` to external files, then bundling at build time with `swagger-cli bundle`.
