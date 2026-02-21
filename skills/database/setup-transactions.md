---
name: setup-transactions
description: Implement database transactions with proper isolation levels and rollback handling
argument-hint: [isolation: read-uncommitted|read-committed|repeatable-read|serializable]
---

# Setup Database Transactions

Implement ACID-compliant transactions with proper error handling and rollback logic.

## When to Use
- Multi-step operations that must succeed together
- Financial transactions
- Inventory updates
- User registration with related records
- Batch operations requiring consistency

## Transaction Isolation Levels

### Read Uncommitted
- Lowest isolation, highest concurrency
- Dirty reads possible
- Use for: Non-critical aggregations

### Read Committed (Default)
- Prevents dirty reads
- Non-repeatable reads possible
- Use for: Most application transactions

### Repeatable Read
- Prevents dirty + non-repeatable reads
- Phantom reads possible
- Use for: Financial calculations

### Serializable
- Highest isolation, lowest concurrency
- No anomalies
- Use for: Critical financial operations

## Implementation Patterns

### .NET (EF Core)
```csharp
using var transaction = await _dbContext.Database.BeginTransactionAsync(
    IsolationLevel.ReadCommitted);
try
{
    // Step 1: Deduct inventory
    var product = await _dbContext.Products.FindAsync(productId);
    product.StockQuantity -= quantity;

    // Step 2: Create order
    var order = new Order { ProductId = productId, Quantity = quantity };
    _dbContext.Orders.Add(order);

    // Step 3: Save all changes
    await _dbContext.SaveChangesAsync();
    await transaction.CommitAsync();
}
catch (Exception ex)
{
    await transaction.RollbackAsync();
    _logger.LogError(ex, "Transaction failed");
    throw;
}
```

### Node.js (PostgreSQL)
```javascript
const client = await pool.connect();
try {
    await client.query('BEGIN');

    // Step 1
    await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2',
        [quantity, productId]);

    // Step 2
    await client.query('INSERT INTO orders (product_id, quantity) VALUES ($1, $2)',
        [productId, quantity]);

    await client.query('COMMIT');
} catch (e) {
    await client.query('ROLLBACK');
    throw e;
} finally {
    client.release();
}
```

### Python (SQLAlchemy)
```python
from sqlalchemy.orm import Session

with Session(engine) as session:
    try:
        # Operations
        product = session.query(Product).get(product_id)
        product.stock -= quantity

        order = Order(product_id=product_id, quantity=quantity)
        session.add(order)

        session.commit()
    except Exception as e:
        session.rollback()
        raise
```

## Best Practices
1. Keep transactions short (minimize lock duration)
2. Always wrap in try/catch with rollback
3. Use appropriate isolation level
4. Avoid user interaction during transaction
5. Log transaction failures
6. Use savepoints for complex transactions
7. Consider optimistic concurrency for long operations
