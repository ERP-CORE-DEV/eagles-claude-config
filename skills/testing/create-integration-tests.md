---
name: create-integration-tests
description: Create integration tests for API endpoints, database operations, and external services
argument-hint: [type: api|database|messaging|external] [stack: dotnet|node|python]
---

# Create Integration Tests

Test multiple components working together (controllers + services + database).

## Integration Test Types

### API Integration Tests
- Test HTTP endpoints end-to-end
- Real request/response cycle
- Authentication and authorization
- Input validation
- Database persistence

### Database Integration Tests
- Test repository layer with real database
- Transaction rollback after tests
- Schema migrations
- Query performance

### Message Queue Integration
- Test publish/subscribe patterns
- Message handling
- Dead letter queues

### External Service Integration
- Test third-party API calls
- Use test doubles or sandboxes
- Handle timeouts and failures

## .NET Integration Tests with WebApplicationFactory

### Setup

```csharp
// ProductsIntegrationTests.cs
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using System.Net.Http.Json;
using Xunit;
using FluentAssertions;

namespace Sourcing.CandidateAttraction.Tests.Integration
{
    public class ProductsIntegrationTests : IClassFixture<WebApplicationFactory<Program>>
    {
        private readonly HttpClient _client;
        private readonly WebApplicationFactory<Program> _factory;

        public ProductsIntegrationTests(WebApplicationFactory<Program> factory)
        {
            _factory = factory.WithWebHostBuilder(builder =>
            {
                builder.ConfigureServices(services =>
                {
                    // Replace production database with test database
                    services.RemoveAll<DbContext>();
                    services.AddDbContext<ApplicationDbContext>(options =>
                        options.UseInMemoryDatabase("TestDb"));

                    // Override configuration
                    services.Configure<JwtSettings>(options =>
                    {
                        options.Secret = "test-secret-key-for-jwt-token-generation-in-tests";
                    });
                });
            });

            _client = _factory.CreateClient();
        }

        [Fact]
        public async Task GetProducts_ReturnsSuccessStatusCode()
        {
            // Act
            var response = await _client.GetAsync("/api/products");

            // Assert
            response.EnsureSuccessStatusCode();
            response.Content.Headers.ContentType?.MediaType.Should().Be("application/json");
        }

        [Fact]
        public async Task GetProduct_ValidId_ReturnsProduct()
        {
            // Arrange
            var createDto = new CreateProductDto
            {
                Name = "Test Product",
                Price = 99.99m,
                StockQuantity = 50
            };

            var createResponse = await _client.PostAsJsonAsync("/api/products", createDto);
            var createdProduct = await createResponse.Content.ReadFromJsonAsync<ProductResponseDto>();

            // Act
            var response = await _client.GetAsync($"/api/products/{createdProduct.Id}");

            // Assert
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var product = await response.Content.ReadFromJsonAsync<ProductResponseDto>();
            product.Should().NotBeNull();
            product.Name.Should().Be("Test Product");
            product.Price.Should().Be(99.99m);
        }

        [Fact]
        public async Task GetProduct_NonExistentId_ReturnsNotFound()
        {
            // Arrange
            var nonExistentId = Guid.NewGuid();

            // Act
            var response = await _client.GetAsync($"/api/products/{nonExistentId}");

            // Assert
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task CreateProduct_ValidData_ReturnsCreated()
        {
            // Arrange
            var createDto = new CreateProductDto
            {
                Name = "New Product",
                Price = 49.99m,
                StockQuantity = 100,
                Description = "Test description"
            };

            // Act
            var response = await _client.PostAsJsonAsync("/api/products", createDto);

            // Assert
            response.StatusCode.Should().Be(HttpStatusCode.Created);
            response.Headers.Location.Should().NotBeNull();

            var product = await response.Content.ReadFromJsonAsync<ProductResponseDto>();
            product.Should().NotBeNull();
            product.Id.Should().NotBeEmpty();
            product.Name.Should().Be(createDto.Name);
            product.Price.Should().Be(createDto.Price);
            product.CreatedAt.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromSeconds(5));
        }

        [Fact]
        public async Task CreateProduct_InvalidData_ReturnsBadRequest()
        {
            // Arrange
            var invalidDto = new CreateProductDto
            {
                Name = "", // Invalid: empty name
                Price = -10m, // Invalid: negative price
                StockQuantity = -5 // Invalid: negative stock
            };

            // Act
            var response = await _client.PostAsJsonAsync("/api/products", invalidDto);

            // Assert
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

            var errorResponse = await response.Content.ReadFromJsonAsync<ValidationErrorResponse>();
            errorResponse.Errors.Should().ContainKey("Name");
            errorResponse.Errors.Should().ContainKey("Price");
            errorResponse.Errors.Should().ContainKey("StockQuantity");
        }

        [Fact]
        public async Task UpdateProduct_ValidData_ReturnsOk()
        {
            // Arrange - Create product first
            var createDto = new CreateProductDto
            {
                Name = "Original Name",
                Price = 50m,
                StockQuantity = 10
            };
            var createResponse = await _client.PostAsJsonAsync("/api/products", createDto);
            var createdProduct = await createResponse.Content.ReadFromJsonAsync<ProductResponseDto>();

            // Arrange - Update data
            var updateDto = new UpdateProductDto
            {
                Name = "Updated Name",
                Price = 75m,
                StockQuantity = 20
            };

            // Act
            var response = await _client.PutAsJsonAsync(
                $"/api/products/{createdProduct.Id}",
                updateDto
            );

            // Assert
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var updatedProduct = await response.Content.ReadFromJsonAsync<ProductResponseDto>();
            updatedProduct.Name.Should().Be("Updated Name");
            updatedProduct.Price.Should().Be(75m);
            updatedProduct.StockQuantity.Should().Be(20);
        }

        [Fact]
        public async Task DeleteProduct_ExistingProduct_ReturnsNoContent()
        {
            // Arrange - Create product
            var createDto = new CreateProductDto
            {
                Name = "To Be Deleted",
                Price = 25m,
                StockQuantity = 5
            };
            var createResponse = await _client.PostAsJsonAsync("/api/products", createDto);
            var createdProduct = await createResponse.Content.ReadFromJsonAsync<ProductResponseDto>();

            // Act
            var response = await _client.DeleteAsync($"/api/products/{createdProduct.Id}");

            // Assert
            response.StatusCode.Should().Be(HttpStatusCode.NoContent);

            // Verify deletion
            var getResponse = await _client.GetAsync($"/api/products/{createdProduct.Id}");
            getResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task CreateProduct_WithoutAuthentication_ReturnsUnauthorized()
        {
            // Arrange
            var createDto = new CreateProductDto
            {
                Name = "Product",
                Price = 50m,
                StockQuantity = 10
            };

            // Act - Don't set Authorization header
            var response = await _client.PostAsJsonAsync("/api/products", createDto);

            // Assert
            response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        }

        [Fact]
        public async Task GetProducts_Pagination_ReturnsCorrectPage()
        {
            // Arrange - Create multiple products
            for (int i = 1; i <= 25; i++)
            {
                await _client.PostAsJsonAsync("/api/products", new CreateProductDto
                {
                    Name = $"Product {i}",
                    Price = i * 10m,
                    StockQuantity = i
                });
            }

            // Act
            var response = await _client.GetAsync("/api/products?page=2&pageSize=10");

            // Assert
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var result = await response.Content.ReadFromJsonAsync<PagedResult<ProductResponseDto>>();
            result.Items.Should().HaveCount(10);
            result.Page.Should().Be(2);
            result.PageSize.Should().Be(10);
            result.TotalCount.Should().BeGreaterOrEqualTo(25);
        }
    }
}
```

## Node.js/Express Integration Tests (Supertest)

```javascript
// products.integration.test.ts
import request from 'supertest';
import { app } from '../app';
import { db } from '../database';

describe('Products API Integration Tests', () => {
  beforeAll(async () => {
    // Connect to test database
    await db.connect(process.env.TEST_DATABASE_URL);
  });

  afterAll(async () => {
    // Disconnect from database
    await db.disconnect();
  });

  beforeEach(async () => {
    // Clean database before each test
    await db.products.deleteMany({});
  });

  describe('GET /api/products', () => {
    it('should return empty array when no products exist', async () => {
      const response = await request(app)
        .get('/api/products')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toEqual([]);
    });

    it('should return all products', async () => {
      // Arrange
      await db.products.insertMany([
        { name: 'Product 1', price: 10 },
        { name: 'Product 2', price: 20 }
      ]);

      // Act
      const response = await request(app)
        .get('/api/products')
        .expect(200);

      // Assert
      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toHaveProperty('name', 'Product 1');
    });
  });

  describe('POST /api/products', () => {
    it('should create product with valid data', async () => {
      const newProduct = {
        name: 'New Product',
        price: 99.99,
        stockQuantity: 50
      };

      const response = await request(app)
        .post('/api/products')
        .send(newProduct)
        .set('Authorization', `Bearer ${getTestToken()}`)
        .expect(201)
        .expect('Content-Type', /json/);

      expect(response.body).toMatchObject(newProduct);
      expect(response.body).toHaveProperty('_id');
      expect(response.headers.location).toContain(response.body._id);

      // Verify database
      const savedProduct = await db.products.findById(response.body._id);
      expect(savedProduct).toBeTruthy();
      expect(savedProduct.name).toBe(newProduct.name);
    });

    it('should return 400 with validation errors for invalid data', async () => {
      const invalidProduct = {
        name: '',
        price: -10,
        stockQuantity: -5
      };

      const response = await request(app)
        .post('/api/products')
        .send(invalidProduct)
        .set('Authorization', `Bearer ${getTestToken()}`)
        .expect(400);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors).toHaveProperty('name');
      expect(response.body.errors).toHaveProperty('price');
    });

    it('should return 401 without authentication token', async () => {
      const newProduct = {
        name: 'Product',
        price: 50,
        stockQuantity: 10
      };

      await request(app)
        .post('/api/products')
        .send(newProduct)
        .expect(401);
    });
  });

  describe('PUT /api/products/:id', () => {
    it('should update existing product', async () => {
      // Arrange
      const product = await db.products.create({
        name: 'Original',
        price: 50,
        stockQuantity: 10
      });

      const updates = {
        name: 'Updated',
        price: 75
      };

      // Act
      const response = await request(app)
        .put(`/api/products/${product._id}`)
        .send(updates)
        .set('Authorization', `Bearer ${getTestToken()}`)
        .expect(200);

      // Assert
      expect(response.body.name).toBe('Updated');
      expect(response.body.price).toBe(75);
      expect(response.body.stockQuantity).toBe(10); // unchanged

      // Verify database
      const updatedProduct = await db.products.findById(product._id);
      expect(updatedProduct.name).toBe('Updated');
    });

    it('should return 404 for non-existent product', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      await request(app)
        .put(`/api/products/${fakeId}`)
        .send({ name: 'Updated' })
        .set('Authorization', `Bearer ${getTestToken()}`)
        .expect(404);
    });
  });

  describe('DELETE /api/products/:id', () => {
    it('should delete existing product', async () => {
      // Arrange
      const product = await db.products.create({
        name: 'To Delete',
        price: 25
      });

      // Act
      await request(app)
        .delete(`/api/products/${product._id}`)
        .set('Authorization', `Bearer ${getTestToken()}`)
        .expect(204);

      // Assert - verify deletion
      const deletedProduct = await db.products.findById(product._id);
      expect(deletedProduct).toBeNull();
    });
  });
});

function getTestToken(): string {
  // Generate test JWT token
  return jwt.sign(
    { userId: 'test-user', role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}
```

## Database Integration Tests

```csharp
// ProductRepositoryIntegrationTests.cs
public class ProductRepositoryIntegrationTests : IAsyncLifetime
{
    private readonly CosmosClient _cosmosClient;
    private readonly ProductRepository _repository;
    private Database _database;
    private Container _container;

    public ProductRepositoryIntegrationTests()
    {
        _cosmosClient = new CosmosClient(
            "AccountEndpoint=https://localhost:8081/;AccountKey=C2y6yDjf5/...",
            new CosmosClientOptions
            {
                SerializerOptions = new CosmosSerializationOptions
                {
                    PropertyNamingPolicy = CosmosPropertyNamingPolicy.CamelCase
                }
            }
        );
    }

    public async Task InitializeAsync()
    {
        // Create test database and container
        _database = await _cosmosClient.CreateDatabaseIfNotExistsAsync("TestDb");
        _container = await _database.CreateContainerIfNotExistsAsync(
            "Products",
            "/id"
        );

        _repository = new ProductRepository(_container);
    }

    public async Task DisposeAsync()
    {
        // Clean up test database
        await _database.DeleteAsync();
        _cosmosClient.Dispose();
    }

    [Fact]
    public async Task CreateAsync_ValidProduct_SavesToDatabase()
    {
        // Arrange
        var product = new Product
        {
            Id = Guid.NewGuid(),
            Name = "Test Product",
            Price = 99.99m,
            StockQuantity = 50
        };

        // Act
        var result = await _repository.CreateAsync(product);

        // Assert
        result.Should().NotBeNull();
        result.Id.Should().Be(product.Id);

        // Verify in database
        var saved = await _repository.GetByIdAsync(product.Id);
        saved.Should().NotBeNull();
        saved.Name.Should().Be("Test Product");
    }

    [Fact]
    public async Task GetByIdAsync_ExistingProduct_ReturnsProduct()
    {
        // Arrange
        var product = new Product
        {
            Id = Guid.NewGuid(),
            Name = "Test",
            Price = 50m
        };
        await _repository.CreateAsync(product);

        // Act
        var result = await _repository.GetByIdAsync(product.Id);

        // Assert
        result.Should().NotBeNull();
        result.Id.Should().Be(product.Id);
    }

    [Fact]
    public async Task UpdateAsync_ExistingProduct_UpdatesDatabase()
    {
        // Arrange
        var product = new Product
        {
            Id = Guid.NewGuid(),
            Name = "Original",
            Price = 50m
        };
        await _repository.CreateAsync(product);

        product.Name = "Updated";
        product.Price = 75m;

        // Act
        await _repository.UpdateAsync(product);

        // Assert
        var updated = await _repository.GetByIdAsync(product.Id);
        updated.Name.Should().Be("Updated");
        updated.Price.Should().Be(75m);
    }
}
```

## Best Practices

1. **Test Database**: Use separate test database or in-memory database
2. **Clean State**: Reset database before each test
3. **Realistic Data**: Use production-like test data
4. **End-to-End**: Test full request/response cycle
5. **Authentication**: Test with/without auth tokens
6. **Error Cases**: Test 4xx and 5xx responses
7. **Isolation**: Tests should not depend on each other
8. **Performance**: Monitor test execution time
9. **CI Integration**: Run integration tests in CI/CD pipeline
10. **Test Containers**: Use Docker containers for dependencies (databases, message queues)
