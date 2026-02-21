---
name: add-validation
description: Add comprehensive input validation with clear error messages and business rule enforcement
argument-hint: [type: input|business|security] [stack: dotnet|node|python|java]
---

# Add Validation

Implement robust validation for input data, business rules, and security constraints.

## Validation Types

### 1. Input Validation
- Data type checking
- Required fields
- String length limits
- Numeric ranges
- Format validation (email, phone, URL)
- Regex patterns

### 2. Business Rule Validation
- Entity state validation
- Cross-field dependencies
- Referential integrity
- Domain-specific constraints
- Workflow state transitions

### 3. Security Validation
- SQL injection prevention
- XSS prevention
- Path traversal prevention
- Authentication requirements
- Authorization rules

## Implementation by Stack

### .NET (Data Annotations + FluentValidation)

```csharp
// Data Annotations (simple cases)
public class CreateUserDto
{
    [Required(ErrorMessage = "Email is required")]
    [EmailAddress(ErrorMessage = "Invalid email format")]
    [StringLength(200)]
    public string Email { get; set; }

    [Required]
    [StringLength(100, MinimumLength = 8,
        ErrorMessage = "Password must be 8-100 characters")]
    [RegularExpression(@"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)",
        ErrorMessage = "Password must contain uppercase, lowercase, and digit")]
    public string Password { get; set; }

    [Range(18, 120, ErrorMessage = "Age must be between 18 and 120")]
    public int Age { get; set; }
}

// FluentValidation (complex cases)
public class CreateUserValidator : AbstractValidator<CreateUserDto>
{
    private readonly IUserRepository _userRepository;

    public CreateUserValidator(IUserRepository userRepository)
    {
        _userRepository = userRepository;

        RuleFor(x => x.Email)
            .NotEmpty().WithMessage("Email is required")
            .EmailAddress().WithMessage("Invalid email format")
            .MaximumLength(200)
            .MustAsync(BeUniqueEmail)
                .WithMessage("Email already registered");

        RuleFor(x => x.Password)
            .NotEmpty()
            .MinimumLength(8)
            .Matches(@"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)")
                .WithMessage("Password must contain uppercase, lowercase, and digit");

        RuleFor(x => x.Age)
            .InclusiveBetween(18, 120);
    }

    private async Task<bool> BeUniqueEmail(string email, CancellationToken ct)
    {
        return !await _userRepository.EmailExistsAsync(email);
    }
}

// Usage in controller
[HttpPost]
public async Task<IActionResult> CreateUser(
    [FromBody] CreateUserDto dto,
    [FromServices] IValidator<CreateUserDto> validator)
{
    var validationResult = await validator.ValidateAsync(dto);
    if (!validationResult.IsValid)
    {
        return BadRequest(validationResult.Errors.Select(e => new
        {
            Field = e.PropertyName,
            Error = e.ErrorMessage
        }));
    }

    // Proceed with creation
}
```

### Node.js (express-validator + Joi)

```javascript
// express-validator
const { body, validationResult } = require('express-validator');

const createUserValidation = [
  body('email')
    .trim()
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail()
    .custom(async (email) => {
      const exists = await User.findOne({ email });
      if (exists) {
        throw new Error('Email already registered');
      }
    }),

  body('password')
    .isLength({ min: 8, max: 100 })
      .withMessage('Password must be 8-100 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain uppercase, lowercase, and digit'),

  body('age')
    .isInt({ min: 18, max: 120 })
      .withMessage('Age must be between 18 and 120')
];

router.post('/users', createUserValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  // Proceed
});

// Joi (alternative)
const Joi = require('joi');

const createUserSchema = Joi.object({
  email: Joi.string()
    .email()
    .max(200)
    .required()
    .messages({
      'string.email': 'Invalid email format',
      'any.required': 'Email is required'
    }),

  password: Joi.string()
    .min(8)
    .max(100)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.pattern.base': 'Password must contain uppercase, lowercase, and digit'
    }),

  age: Joi.number()
    .integer()
    .min(18)
    .max(120)
    .required()
});

// Usage
const { error, value } = createUserSchema.validate(req.body, { abortEarly: false });
if (error) {
  return res.status(400).json({
    errors: error.details.map(d => ({ field: d.path[0], message: d.message }))
  });
}
```

### Python (Pydantic)

```python
from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional

class CreateUserRequest(BaseModel):
    email: EmailStr = Field(..., max_length=200)
    password: str = Field(..., min_length=8, max_length=100)
    age: int = Field(..., ge=18, le=120)

    @validator('password')
    def validate_password_complexity(cls, v):
        if not any(c.isupper() for c in v):
            raise ValueError('Password must contain uppercase letter')
        if not any(c.islower() for c in v):
            raise ValueError('Password must contain lowercase letter')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain digit')
        return v

    @validator('email')
    def validate_unique_email(cls, v):
        if User.objects.filter(email=v).exists():
            raise ValueError('Email already registered')
        return v

# FastAPI usage
@app.post("/users")
async def create_user(user: CreateUserRequest):
    # Validation automatic via Pydantic
    pass
```

## Business Rule Validation Example

```csharp
public class TransferFundsValidator : AbstractValidator<TransferFundsRequest>
{
    private readonly IAccountRepository _accountRepo;

    public TransferFundsValidator(IAccountRepository accountRepo)
    {
        _accountRepo = accountRepo;

        RuleFor(x => x.Amount)
            .GreaterThan(0)
            .WithMessage("Transfer amount must be positive");

        RuleFor(x => x.FromAccountId)
            .NotEqual(x => x.ToAccountId)
            .WithMessage("Cannot transfer to same account");

        RuleFor(x => x)
            .MustAsync(HaveSufficientBalance)
            .WithMessage("Insufficient balance");
    }

    private async Task<bool> HaveSufficientBalance(
        TransferFundsRequest request,
        CancellationToken ct)
    {
        var account = await _accountRepo.GetByIdAsync(request.FromAccountId);
        return account.Balance >= request.Amount;
    }
}
```

## Best Practices
1. Validate early (controller/route level)
2. Return clear, actionable error messages
3. Use localization for error messages
4. Validate business rules in service layer
5. Don't expose internal error details to clients
6. Log validation failures for monitoring
7. Use parameterized queries (SQL injection prevention)
8. Sanitize HTML inputs (XSS prevention)
9. Validate file uploads (size, type, content)
10. Rate limit validation-heavy endpoints
