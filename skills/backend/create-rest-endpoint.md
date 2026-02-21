---
name: create-rest-endpoint
description: Create a new REST API endpoint with routing, validation, error handling, and documentation
argument-hint: [method: GET|POST|PUT|PATCH|DELETE] [stack: dotnet|node|python|java|go]
---

# Create REST API Endpoint

Generate a complete REST API endpoint following industry best practices.

## When to Use
- Adding new API functionality
- CRUD operations for entities
- Business logic exposed via HTTP
- Integration points for frontend/external systems

## What This Skill Does
1. Creates controller/route handler
2. Defines request/response DTOs
3. Implements input validation
4. Adds authentication/authorization
5. Implements service layer logic
6. Handles errors gracefully
7. Generates OpenAPI/Swagger documentation
8. Adds unit tests

## Generated Components

### Controller/Handler
- Route mapping with HTTP verb
- Parameter binding (path, query, body)
- Model validation
- Authorization checks
- Service delegation

### DTOs
- Request model with validation attributes
- Response model
- Mapping logic to/from domain

### Service Layer
- Business logic implementation
- Repository calls
- Domain validation
- Transaction management

### Error Handling
- 400 Bad Request for validation errors
- 401 Unauthorized for auth failures
- 404 Not Found for missing resources
- 500 Internal Server Error with logging

## Example: .NET 8 Implementation

```csharp
// Controller
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ProductsController : ControllerBase
{
    private readonly IProductService _productService;
    private readonly ILogger<ProductsController> _logger;

    public ProductsController(
        IProductService productService,
        ILogger<ProductsController> logger)
    {
        _productService = productService;
        _logger = logger;
    }

    /// <summary>
    /// Creates a new product
    /// </summary>
    /// <response code="201">Product created successfully</response>
    /// <response code="400">Invalid request data</response>
    /// <response code="401">Unauthorized</response>
    [HttpPost]
    [ProducesResponseType(typeof(ProductResponseDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<ProductResponseDto>> CreateProduct(
        [FromBody] CreateProductRequestDto request)
    {
        try
        {
            var product = await _productService.CreateProductAsync(request);
            return CreatedAtAction(
                nameof(GetProduct),
                new { id = product.Id },
                product);
        }
        catch (ValidationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to create product");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpGet("{id}")]
    [ProducesResponseType(typeof(ProductResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ProductResponseDto>> GetProduct(Guid id)
    {
        var product = await _productService.GetProductByIdAsync(id);
        if (product == null)
            return NotFound();

        return Ok(product);
    }
}

// Request DTO
public record CreateProductRequestDto
{
    [Required(ErrorMessage = "Product name is required")]
    [StringLength(200, MinimumLength = 3)]
    public string Name { get; init; }

    [Required]
    [Range(0.01, 999999.99)]
    public decimal Price { get; init; }

    [StringLength(1000)]
    public string? Description { get; init; }

    [Range(0, int.MaxValue)]
    public int StockQuantity { get; init; }
}

// Response DTO
public record ProductResponseDto
{
    public Guid Id { get; init; }
    public string Name { get; init; }
    public decimal Price { get; init; }
    public string? Description { get; init; }
    public int StockQuantity { get; init; }
    public DateTime CreatedAt { get; init; }
}
```

## Example: Node.js/Express Implementation

```javascript
// routes/products.js
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const productService = require('../services/productService');
const auth = require('../middleware/auth');

/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Create a new product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateProductRequest'
 *     responses:
 *       201:
 *         description: Product created
 *       400:
 *         description: Invalid input
 */
router.post(
  '/',
  auth,
  [
    body('name').trim().isLength({ min: 3, max: 200 }),
    body('price').isFloat({ min: 0.01 }),
    body('stockQuantity').isInt({ min: 0 })
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const product = await productService.createProduct(req.body);
      res.status(201).json(product);
    } catch (error) {
      console.error('Failed to create product:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

module.exports = router;
```

## Best Practices Applied
- RESTful URL design (/api/products, /api/products/{id})
- Proper HTTP verbs and status codes
- Input validation with clear error messages
- Authentication and authorization
- OpenAPI/Swagger documentation
- Structured logging
- Async/await for I/O operations
- Error handling with appropriate HTTP codes
- Response DTOs (never expose domain models)
