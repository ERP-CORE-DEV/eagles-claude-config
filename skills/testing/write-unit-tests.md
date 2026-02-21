---
name: write-unit-tests
description: Generate unit tests with mocking, assertions, and edge case coverage
argument-hint: [framework: xunit|jest|pytest|junit|go-test] [type: service|controller|component|util]
---

# Write Unit Tests

Create comprehensive unit tests with high code coverage and edge case handling.

## Testing Frameworks

- **.NET**: xUnit, NUnit, MSTest
- **JavaScript/TypeScript**: Jest, Vitest, Mocha
- **Python**: pytest, unittest
- **Java**: JUnit 5, TestNG
- **Go**: testing package

## What This Skill Generates

1. **Test file** with proper naming (`ClassName.test.ts`, `ClassNameTests.cs`)
2. **Test setup** (arrange) with mocks and fixtures
3. **Test cases** covering happy path, edge cases, errors
4. **Assertions** for expected behavior
5. **Mocks/stubs** for dependencies
6. **Test cleanup** (dispose, teardown)

## .NET/xUnit Example

```csharp
// ProductServiceTests.cs
using Xunit;
using Moq;
using FluentAssertions;
using Sourcing.CandidateAttraction.Services;
using Sourcing.CandidateAttraction.Repositories;
using Sourcing.CandidateAttraction.Models;

namespace Sourcing.CandidateAttraction.Tests.Services
{
    public class ProductServiceTests
    {
        private readonly Mock<IProductRepository> _mockRepo;
        private readonly Mock<ILogger<ProductService>> _mockLogger;
        private readonly ProductService _sut; // System Under Test

        public ProductServiceTests()
        {
            _mockRepo = new Mock<IProductRepository>();
            _mockLogger = new Mock<ILogger<ProductService>>();
            _sut = new ProductService(_mockRepo.Object, _mockLogger.Object);
        }

        [Fact]
        public async Task GetProductByIdAsync_ValidId_ReturnsProduct()
        {
            // Arrange
            var productId = Guid.NewGuid();
            var expectedProduct = new Product
            {
                Id = productId,
                Name = "Test Product",
                Price = 99.99m
            };

            _mockRepo
                .Setup(r => r.GetByIdAsync(productId))
                .ReturnsAsync(expectedProduct);

            // Act
            var result = await _sut.GetProductByIdAsync(productId);

            // Assert
            result.Should().NotBeNull();
            result.Id.Should().Be(productId);
            result.Name.Should().Be("Test Product");
            result.Price.Should().Be(99.99m);

            _mockRepo.Verify(r => r.GetByIdAsync(productId), Times.Once);
        }

        [Fact]
        public async Task GetProductByIdAsync_NonExistentId_ReturnsNull()
        {
            // Arrange
            var productId = Guid.NewGuid();
            _mockRepo
                .Setup(r => r.GetByIdAsync(productId))
                .ReturnsAsync((Product?)null);

            // Act
            var result = await _sut.GetProductByIdAsync(productId);

            // Assert
            result.Should().BeNull();
        }

        [Fact]
        public async Task CreateProductAsync_ValidData_ReturnsCreatedProduct()
        {
            // Arrange
            var createDto = new CreateProductDto
            {
                Name = "New Product",
                Price = 49.99m,
                StockQuantity = 100
            };

            var createdProduct = new Product
            {
                Id = Guid.NewGuid(),
                Name = createDto.Name,
                Price = createDto.Price,
                StockQuantity = createDto.StockQuantity,
                CreatedAt = DateTime.UtcNow
            };

            _mockRepo
                .Setup(r => r.CreateAsync(It.IsAny<Product>()))
                .ReturnsAsync(createdProduct);

            // Act
            var result = await _sut.CreateProductAsync(createDto);

            // Assert
            result.Should().NotBeNull();
            result.Name.Should().Be(createDto.Name);
            result.Price.Should().Be(createDto.Price);
            result.Id.Should().NotBeEmpty();

            _mockRepo.Verify(r => r.CreateAsync(It.Is<Product>(p =>
                p.Name == createDto.Name &&
                p.Price == createDto.Price &&
                p.StockQuantity == createDto.StockQuantity
            )), Times.Once);
        }

        [Theory]
        [InlineData("")]
        [InlineData("   ")]
        [InlineData(null)]
        public async Task CreateProductAsync_InvalidName_ThrowsValidationException(string invalidName)
        {
            // Arrange
            var createDto = new CreateProductDto
            {
                Name = invalidName,
                Price = 49.99m
            };

            // Act & Assert
            await Assert.ThrowsAsync<ValidationException>(
                () => _sut.CreateProductAsync(createDto)
            );

            _mockRepo.Verify(r => r.CreateAsync(It.IsAny<Product>()), Times.Never);
        }

        [Fact]
        public async Task CreateProductAsync_NegativePrice_ThrowsValidationException()
        {
            // Arrange
            var createDto = new CreateProductDto
            {
                Name = "Product",
                Price = -10m
            };

            // Act & Assert
            var exception = await Assert.ThrowsAsync<ValidationException>(
                () => _sut.CreateProductAsync(createDto)
            );

            exception.Message.Should().Contain("Price must be positive");
            _mockRepo.Verify(r => r.CreateAsync(It.IsAny<Product>()), Times.Never);
        }

        [Fact]
        public async Task UpdateProductAsync_ValidData_ReturnsUpdatedProduct()
        {
            // Arrange
            var productId = Guid.NewGuid();
            var existingProduct = new Product
            {
                Id = productId,
                Name = "Old Name",
                Price = 50m
            };

            var updateDto = new UpdateProductDto
            {
                Name = "New Name",
                Price = 75m
            };

            _mockRepo
                .Setup(r => r.GetByIdAsync(productId))
                .ReturnsAsync(existingProduct);

            _mockRepo
                .Setup(r => r.UpdateAsync(It.IsAny<Product>()))
                .ReturnsAsync((Product p) => p);

            // Act
            var result = await _sut.UpdateProductAsync(productId, updateDto);

            // Assert
            result.Name.Should().Be("New Name");
            result.Price.Should().Be(75m);

            _mockRepo.Verify(r => r.UpdateAsync(It.Is<Product>(p =>
                p.Id == productId &&
                p.Name == "New Name" &&
                p.Price == 75m
            )), Times.Once);
        }

        [Fact]
        public async Task UpdateProductAsync_NonExistentProduct_ThrowsNotFoundException()
        {
            // Arrange
            var productId = Guid.NewGuid();
            var updateDto = new UpdateProductDto { Name = "Name", Price = 50m };

            _mockRepo
                .Setup(r => r.GetByIdAsync(productId))
                .ReturnsAsync((Product?)null);

            // Act & Assert
            await Assert.ThrowsAsync<NotFoundException>(
                () => _sut.UpdateProductAsync(productId, updateDto)
            );

            _mockRepo.Verify(r => r.UpdateAsync(It.IsAny<Product>()), Times.Never);
        }

        [Fact]
        public async Task DeleteProductAsync_ExistingProduct_DeletesSuccessfully()
        {
            // Arrange
            var productId = Guid.NewGuid();
            var existingProduct = new Product { Id = productId, Name = "Product" };

            _mockRepo
                .Setup(r => r.GetByIdAsync(productId))
                .ReturnsAsync(existingProduct);

            _mockRepo
                .Setup(r => r.DeleteAsync(productId))
                .ReturnsAsync(true);

            // Act
            await _sut.DeleteProductAsync(productId);

            // Assert
            _mockRepo.Verify(r => r.DeleteAsync(productId), Times.Once);
        }

        [Fact]
        public async Task DeleteProductAsync_NonExistentProduct_ThrowsNotFoundException()
        {
            // Arrange
            var productId = Guid.NewGuid();

            _mockRepo
                .Setup(r => r.GetByIdAsync(productId))
                .ReturnsAsync((Product?)null);

            // Act & Assert
            await Assert.ThrowsAsync<NotFoundException>(
                () => _sut.DeleteProductAsync(productId)
            );

            _mockRepo.Verify(r => r.DeleteAsync(It.IsAny<Guid>()), Times.Never);
        }

        [Fact]
        public async Task GetProductsAsync_ReturnsPagedResults()
        {
            // Arrange
            var products = new List<Product>
            {
                new() { Id = Guid.NewGuid(), Name = "Product 1", Price = 10m },
                new() { Id = Guid.NewGuid(), Name = "Product 2", Price = 20m },
                new() { Id = Guid.NewGuid(), Name = "Product 3", Price = 30m }
            };

            _mockRepo
                .Setup(r => r.GetPagedAsync(1, 10))
                .ReturnsAsync(new PagedResult<Product>
                {
                    Items = products,
                    TotalCount = 3,
                    Page = 1,
                    PageSize = 10
                });

            // Act
            var result = await _sut.GetProductsAsync(1, 10);

            // Assert
            result.Items.Should().HaveCount(3);
            result.TotalCount.Should().Be(3);
            result.Page.Should().Be(1);
        }
    }
}
```

## Jest/TypeScript Example

```typescript
// userService.test.ts
import { UserService } from './userService';
import { UserRepository } from './userRepository';
import { User, CreateUserDto } from './types';

// Mock the repository
jest.mock('./userRepository');

describe('UserService', () => {
  let userService: UserService;
  let mockUserRepository: jest.Mocked<UserRepository>;

  beforeEach(() => {
    // Create mock instance
    mockUserRepository = new UserRepository() as jest.Mocked<UserRepository>;
    userService = new UserService(mockUserRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserById', () => {
    it('should return user when found', async () => {
      // Arrange
      const userId = '123';
      const expectedUser: User = {
        id: userId,
        name: 'John Doe',
        email: 'john@example.com',
        role: 'user'
      };

      mockUserRepository.findById.mockResolvedValue(expectedUser);

      // Act
      const result = await userService.getUserById(userId);

      // Assert
      expect(result).toEqual(expectedUser);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(userId);
      expect(mockUserRepository.findById).toHaveBeenCalledTimes(1);
    });

    it('should return null when user not found', async () => {
      // Arrange
      mockUserRepository.findById.mockResolvedValue(null);

      // Act
      const result = await userService.getUserById('nonexistent');

      // Assert
      expect(result).toBeNull();
    });

    it('should throw error when repository fails', async () => {
      // Arrange
      const error = new Error('Database connection failed');
      mockUserRepository.findById.mockRejectedValue(error);

      // Act & Assert
      await expect(userService.getUserById('123')).rejects.toThrow(
        'Database connection failed'
      );
    });
  });

  describe('createUser', () => {
    it('should create user with valid data', async () => {
      // Arrange
      const createDto: CreateUserDto = {
        name: 'Jane Doe',
        email: 'jane@example.com',
        role: 'user'
      };

      const createdUser: User = {
        id: 'new-id',
        ...createDto
      };

      mockUserRepository.create.mockResolvedValue(createdUser);

      // Act
      const result = await userService.createUser(createDto);

      // Assert
      expect(result).toEqual(createdUser);
      expect(result.id).toBeDefined();
      expect(mockUserRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: createDto.name,
          email: createDto.email,
          role: createDto.role
        })
      );
    });

    it.each([
      ['', 'john@example.com'],
      ['  ', 'john@example.com'],
      ['John', 'invalid-email'],
      ['John', '']
    ])('should throw validation error for name="%s" and email="%s"', async (name, email) => {
      // Arrange
      const invalidDto: CreateUserDto = { name, email, role: 'user' };

      // Act & Assert
      await expect(userService.createUser(invalidDto)).rejects.toThrow(
        /validation|invalid/i
      );

      expect(mockUserRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('updateUser', () => {
    it('should update existing user', async () => {
      // Arrange
      const userId = '123';
      const existingUser: User = {
        id: userId,
        name: 'Old Name',
        email: 'old@example.com',
        role: 'user'
      };

      const updates = { name: 'New Name' };

      mockUserRepository.findById.mockResolvedValue(existingUser);
      mockUserRepository.update.mockResolvedValue({
        ...existingUser,
        ...updates
      });

      // Act
      const result = await userService.updateUser(userId, updates);

      // Assert
      expect(result.name).toBe('New Name');
      expect(result.email).toBe('old@example.com'); // unchanged
      expect(mockUserRepository.update).toHaveBeenCalledWith(userId, updates);
    });

    it('should throw NotFoundError when user does not exist', async () => {
      // Arrange
      mockUserRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(
        userService.updateUser('nonexistent', { name: 'New Name' })
      ).rejects.toThrow('User not found');

      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteUser', () => {
    it('should delete existing user', async () => {
      // Arrange
      const userId = '123';
      mockUserRepository.findById.mockResolvedValue({
        id: userId,
        name: 'John',
        email: 'john@example.com',
        role: 'user'
      });
      mockUserRepository.delete.mockResolvedValue(true);

      // Act
      await userService.deleteUser(userId);

      // Assert
      expect(mockUserRepository.delete).toHaveBeenCalledWith(userId);
    });

    it('should throw NotFoundError when user does not exist', async () => {
      // Arrange
      mockUserRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(userService.deleteUser('nonexistent')).rejects.toThrow(
        'User not found'
      );

      expect(mockUserRepository.delete).not.toHaveBeenCalled();
    });
  });
});
```

## Python/pytest Example

```python
# test_user_service.py
import pytest
from unittest.mock import Mock, AsyncMock
from user_service import UserService
from user_repository import UserRepository
from models import User, CreateUserDto
from exceptions import ValidationError, NotFoundException

@pytest.fixture
def mock_repo():
    return Mock(spec=UserRepository)

@pytest.fixture
def service(mock_repo):
    return UserService(mock_repo)

class TestUserService:
    @pytest.mark.asyncio
    async def test_get_user_by_id_returns_user_when_found(self, service, mock_repo):
        # Arrange
        user_id = "123"
        expected_user = User(
            id=user_id,
            name="John Doe",
            email="john@example.com",
            role="user"
        )
        mock_repo.find_by_id = AsyncMock(return_value=expected_user)

        # Act
        result = await service.get_user_by_id(user_id)

        # Assert
        assert result == expected_user
        mock_repo.find_by_id.assert_called_once_with(user_id)

    @pytest.mark.asyncio
    async def test_get_user_by_id_returns_none_when_not_found(self, service, mock_repo):
        # Arrange
        mock_repo.find_by_id = AsyncMock(return_value=None)

        # Act
        result = await service.get_user_by_id("nonexistent")

        # Assert
        assert result is None

    @pytest.mark.asyncio
    async def test_create_user_with_valid_data(self, service, mock_repo):
        # Arrange
        create_dto = CreateUserDto(
            name="Jane Doe",
            email="jane@example.com",
            role="user"
        )
        created_user = User(id="new-id", **create_dto.dict())
        mock_repo.create = AsyncMock(return_value=created_user)

        # Act
        result = await service.create_user(create_dto)

        # Assert
        assert result.id == "new-id"
        assert result.name == create_dto.name
        mock_repo.create.assert_called_once()

    @pytest.mark.parametrize("name,email", [
        ("", "john@example.com"),
        ("  ", "john@example.com"),
        ("John", "invalid-email"),
        ("John", "")
    ])
    @pytest.mark.asyncio
    async def test_create_user_invalid_data_raises_validation_error(
        self, service, mock_repo, name, email
    ):
        # Arrange
        invalid_dto = CreateUserDto(name=name, email=email, role="user")

        # Act & Assert
        with pytest.raises(ValidationError):
            await service.create_user(invalid_dto)

        mock_repo.create.assert_not_called()
```

## Best Practices

### AAA Pattern (Arrange-Act-Assert)
1. **Arrange**: Set up test data and mocks
2. **Act**: Execute the method under test
3. **Assert**: Verify the outcome

### Test Naming
- Descriptive names: `MethodName_Scenario_ExpectedResult`
- Example: `CreateUser_InvalidEmail_ThrowsValidationException`

### Coverage Targets
- **Happy path**: Normal expected behavior
- **Edge cases**: Boundary values, empty inputs, nulls
- **Error cases**: Invalid inputs, exceptions
- **State changes**: Verify side effects

### Mocking Best Practices
1. Mock external dependencies only
2. Verify mock interactions (Times.Once, toHaveBeenCalled)
3. Use strict mocks to catch unexpected calls
4. Reset mocks between tests

### Assertions
- Use fluent assertions (FluentAssertions, Jest expect)
- Assert multiple properties
- Clear error messages
- Test both positive and negative cases

### Test Data
- Use test builders for complex objects
- Avoid magic numbers (use constants)
- Keep tests independent (no shared state)
