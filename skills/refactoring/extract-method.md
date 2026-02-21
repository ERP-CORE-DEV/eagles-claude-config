---
name: extract-method
description: Refactor long methods by extracting smaller, focused methods to improve readability and reusability
argument-hint: [language: csharp|typescript|python|java]
---

# Extract Method Refactoring

Break down long, complex methods into smaller, focused methods with clear responsibilities.

## When to Extract a Method

### Code Smells
- Method is longer than 20-30 lines
- Multiple levels of nesting (> 3 levels)
- Repeated code blocks
- Complex conditional logic
- Mixed abstraction levels
- Method does multiple things

### Benefits
- **Readability**: Clearer intent with descriptive names
- **Reusability**: Extracted methods can be reused
- **Testability**: Easier to unit test smaller methods
- **Maintainability**: Localized changes

## Refactoring Examples

### Example 1: Long Method with Multiple Responsibilities

#### Before (C#)
```csharp
public async Task<IActionResult> CreateOrder(CreateOrderDto dto)
{
    // Validate customer
    var customer = await _dbContext.Customers.FindAsync(dto.CustomerId);
    if (customer == null)
        return NotFound("Customer not found");

    if (string.IsNullOrWhiteSpace(customer.Email))
        return BadRequest("Customer email is required");

    // Validate products
    var products = new List<Product>();
    decimal total = 0;
    foreach (var item in dto.Items)
    {
        var product = await _dbContext.Products.FindAsync(item.ProductId);
        if (product == null)
            return NotFound($"Product {item.ProductId} not found");

        if (product.StockQuantity < item.Quantity)
            return BadRequest($"Insufficient stock for {product.Name}");

        products.Add(product);
        total += product.Price * item.Quantity;
    }

    // Apply discount
    if (customer.IsVip && total > 100)
    {
        total *= 0.9m; // 10% VIP discount
    }

    // Create order
    var order = new Order
    {
        Id = Guid.NewGuid(),
        CustomerId = dto.CustomerId,
        OrderDate = DateTime.UtcNow,
        TotalAmount = total,
        Status = OrderStatus.Pending
    };

    _dbContext.Orders.Add(order);

    // Update stock
    foreach (var item in dto.Items)
    {
        var product = products.First(p => p.Id == item.ProductId);
        product.StockQuantity -= item.Quantity;
    }

    // Send confirmation email
    var emailBody = $"Dear {customer.Name}, your order #{order.Id} has been placed. Total: ${total}";
    await _emailService.SendEmailAsync(customer.Email, "Order Confirmation", emailBody);

    await _dbContext.SaveChangesAsync();

    return Ok(order);
}
```

#### After (Extracted Methods)
```csharp
public async Task<IActionResult> CreateOrder(CreateOrderDto dto)
{
    var customer = await ValidateAndGetCustomerAsync(dto.CustomerId);
    if (customer == null)
        return NotFound("Customer not found");

    var validationResult = await ValidateOrderItemsAsync(dto.Items);
    if (!validationResult.IsValid)
        return BadRequest(validationResult.ErrorMessage);

    var total = CalculateTotalAmount(validationResult.Products, dto.Items);
    total = ApplyDiscounts(customer, total);

    var order = CreateOrderEntity(dto.CustomerId, total);
    _dbContext.Orders.Add(order);

    await UpdateProductStockAsync(validationResult.Products, dto.Items);
    await SendOrderConfirmationEmailAsync(customer, order, total);
    await _dbContext.SaveChangesAsync();

    return Ok(order);
}

private async Task<Customer?> ValidateAndGetCustomerAsync(Guid customerId)
{
    var customer = await _dbContext.Customers.FindAsync(customerId);

    if (customer != null && string.IsNullOrWhiteSpace(customer.Email))
        return null; // Invalid customer state

    return customer;
}

private async Task<OrderValidationResult> ValidateOrderItemsAsync(List<OrderItemDto> items)
{
    var products = new List<Product>();

    foreach (var item in items)
    {
        var product = await _dbContext.Products.FindAsync(item.ProductId);

        if (product == null)
            return OrderValidationResult.Failure($"Product {item.ProductId} not found");

        if (product.StockQuantity < item.Quantity)
            return OrderValidationResult.Failure($"Insufficient stock for {product.Name}");

        products.Add(product);
    }

    return OrderValidationResult.Success(products);
}

private decimal CalculateTotalAmount(List<Product> products, List<OrderItemDto> items)
{
    return items.Sum(item =>
    {
        var product = products.First(p => p.Id == item.ProductId);
        return product.Price * item.Quantity;
    });
}

private decimal ApplyDiscounts(Customer customer, decimal total)
{
    if (customer.IsVip && total > 100)
    {
        return total * 0.9m; // 10% VIP discount
    }

    return total;
}

private Order CreateOrderEntity(Guid customerId, decimal total)
{
    return new Order
    {
        Id = Guid.NewGuid(),
        CustomerId = customerId,
        OrderDate = DateTime.UtcNow,
        TotalAmount = total,
        Status = OrderStatus.Pending
    };
}

private async Task UpdateProductStockAsync(List<Product> products, List<OrderItemDto> items)
{
    foreach (var item in items)
    {
        var product = products.First(p => p.Id == item.ProductId);
        product.StockQuantity -= item.Quantity;
    }
}

private async Task SendOrderConfirmationEmailAsync(Customer customer, Order order, decimal total)
{
    var subject = "Order Confirmation";
    var body = $"Dear {customer.Name}, your order #{order.Id} has been placed. Total: ${total}";

    await _emailService.SendEmailAsync(customer.Email, subject, body);
}

// Helper class
private class OrderValidationResult
{
    public bool IsValid { get; init; }
    public string? ErrorMessage { get; init; }
    public List<Product> Products { get; init; } = new();

    public static OrderValidationResult Success(List<Product> products) =>
        new() { IsValid = true, Products = products };

    public static OrderValidationResult Failure(string errorMessage) =>
        new() { IsValid = false, ErrorMessage = errorMessage };
}
```

### Example 2: Extract Complex Condition

#### Before (TypeScript)
```typescript
function processPayment(user: User, amount: number): PaymentResult {
  if (
    user.accountStatus === 'active' &&
    user.paymentMethod !== null &&
    user.balance >= amount &&
    amount > 0 &&
    amount <= 10000 &&
    !user.isBlocked &&
    user.emailVerified &&
    (user.tier === 'premium' || user.accountAge > 30)
  ) {
    // Process payment
    return { success: true, message: 'Payment processed' };
  }

  return { success: false, message: 'Payment failed' };
}
```

#### After
```typescript
function processPayment(user: User, amount: number): PaymentResult {
  if (!isPaymentAllowed(user, amount)) {
    return { success: false, message: 'Payment not allowed' };
  }

  // Process payment
  return { success: true, message: 'Payment processed' };
}

function isPaymentAllowed(user: User, amount: number): boolean {
  return (
    isUserEligible(user) &&
    isAmountValid(amount) &&
    hasSufficientBalance(user, amount)
  );
}

function isUserEligible(user: User): boolean {
  return (
    user.accountStatus === 'active' &&
    user.paymentMethod !== null &&
    !user.isBlocked &&
    user.emailVerified &&
    isQualifiedTier(user)
  );
}

function isQualifiedTier(user: User): boolean {
  return user.tier === 'premium' || user.accountAge > 30;
}

function isAmountValid(amount: number): boolean {
  return amount > 0 && amount <= 10000;
}

function hasSufficientBalance(user: User, amount: number): boolean {
  return user.balance >= amount;
}
```

### Example 3: Extract Nested Loops

#### Before (Python)
```python
def generate_report(users):
    report = []

    for user in users:
        user_data = {'name': user.name, 'orders': []}

        for order in user.orders:
            order_items = []

            for item in order.items:
                product = get_product(item.product_id)
                order_items.append({
                    'product_name': product.name,
                    'quantity': item.quantity,
                    'price': product.price,
                    'subtotal': item.quantity * product.price
                })

            user_data['orders'].append({
                'order_id': order.id,
                'date': order.date,
                'items': order_items,
                'total': sum(item['subtotal'] for item in order_items)
            })

        report.append(user_data)

    return report
```

#### After
```python
def generate_report(users):
    return [generate_user_report(user) for user in users]

def generate_user_report(user):
    return {
        'name': user.name,
        'orders': [generate_order_summary(order) for order in user.orders]
    }

def generate_order_summary(order):
    items = [generate_item_details(item) for item in order.items]

    return {
        'order_id': order.id,
        'date': order.date,
        'items': items,
        'total': calculate_order_total(items)
    }

def generate_item_details(item):
    product = get_product(item.product_id)

    return {
        'product_name': product.name,
        'quantity': item.quantity,
        'price': product.price,
        'subtotal': item.quantity * product.price
    }

def calculate_order_total(items):
    return sum(item['subtotal'] for item in items)
```

### Example 4: Extract Configuration

#### Before (Java)
```java
public void sendNotification(User user, String message) {
    EmailService emailService = new EmailService();
    emailService.setSmtpHost("smtp.gmail.com");
    emailService.setSmtpPort(587);
    emailService.setUsername("noreply@example.com");
    emailService.setPassword("password123");
    emailService.setEnableTls(true);
    emailService.setFromAddress("noreply@example.com");
    emailService.setFromName("MyApp Notifications");

    emailService.send(user.getEmail(), "Notification", message);
}
```

#### After
```java
public void sendNotification(User user, String message) {
    EmailService emailService = createConfiguredEmailService();
    emailService.send(user.getEmail(), "Notification", message);
}

private EmailService createConfiguredEmailService() {
    EmailService emailService = new EmailService();
    emailService.setSmtpHost(getConfigValue("smtp.host"));
    emailService.setSmtpPort(getConfigValue("smtp.port"));
    emailService.setUsername(getConfigValue("smtp.username"));
    emailService.setPassword(getConfigValue("smtp.password"));
    emailService.setEnableTls(true);
    emailService.setFromAddress(getConfigValue("email.from.address"));
    emailService.setFromName(getConfigValue("email.from.name"));

    return emailService;
}

private String getConfigValue(String key) {
    return ConfigurationManager.getAppSetting(key);
}
```

## Refactoring Steps

1. **Identify code to extract**
   - Look for logical groups
   - Find repeated patterns
   - Isolate complex conditions

2. **Choose descriptive name**
   - Use verb + noun (e.g., `validateUser`, `calculateTotal`)
   - Describe what, not how
   - Be specific

3. **Determine parameters**
   - Pass only what's needed
   - Avoid passing entire objects if only one property is used
   - Consider return type

4. **Extract method**
   - Copy code to new method
   - Replace original code with method call
   - Ensure tests still pass

5. **Optimize**
   - Remove duplicate parameters
   - Consider splitting further if still complex
   - Add documentation if needed

## IDE Support

### Visual Studio / Rider
- Right-click → Refactor → Extract Method (Ctrl+R, M)
- Automatically detects parameters and return values

### VS Code
- Right-click → Refactor → Extract Function (Ctrl+Shift+R)

### IntelliJ IDEA
- Right-click → Refactor → Extract Method (Ctrl+Alt+M)

## Best Practices

### ✅ Do's
- Extract methods that do one thing
- Use descriptive names
- Keep methods short (< 20 lines)
- Make extracted methods private if only used internally
- Maintain single level of abstraction

### ❌ Don'ts
- Extract methods just to reduce line count
- Create methods with too many parameters (> 4)
- Extract code that's only used once and doesn't clarify intent
- Break encapsulation by exposing internal details

## Checklist

- [ ] Method is shorter and more focused
- [ ] Method name clearly describes its purpose
- [ ] Parameters are minimal and necessary
- [ ] Return type is clear and appropriate
- [ ] Tests still pass
- [ ] No duplicate code
- [ ] Easier to understand than before
