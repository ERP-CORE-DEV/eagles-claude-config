---
name: create-indexes
description: Design and create database indexes for optimal query performance
argument-hint: [index-type: single|composite|covering|unique|fulltext]
---

# Create Database Indexes

Design and implement indexes to accelerate query performance.

## When to Use
- Slow queries on filtered columns
- Foreign key columns without indexes
- Frequent JOIN operations
- Text search requirements
- Ensuring data uniqueness

## Index Types

### Single Column Index
- Index one column frequently used in WHERE clauses
- Example: `CREATE INDEX IX_Users_Email ON Users(Email)`

### Composite Index
- Multiple columns queried together
- Column order matters (most selective first)
- Example: `CREATE INDEX IX_Orders_CustomerId_Date ON Orders(CustomerId, OrderDate DESC)`

### Covering Index
- Includes all SELECT columns (INCLUDE clause)
- Eliminates table lookups
- Example: `CREATE INDEX IX_Orders_Cover ON Orders(CustomerId) INCLUDE (OrderDate, TotalAmount)`

### Unique Index
- Enforces uniqueness constraint
- Example: `CREATE UNIQUE INDEX UX_Users_Email ON Users(Email)`

### Full-Text Index
- Text search capabilities
- Example: `CREATE FULLTEXT INDEX FTX_Products_Description ON Products(Description)`

## Best Practices
1. Index foreign keys
2. Index columns in WHERE, JOIN, ORDER BY clauses
3. Don't over-index (slows writes)
4. Monitor index usage statistics
5. Remove unused indexes
6. Consider filtered indexes for subsets
7. Rebuild fragmented indexes regularly

## Database-Specific Syntax

**SQL Server:**
```sql
CREATE NONCLUSTERED INDEX IX_Orders_CustomerId
ON Orders(CustomerId)
INCLUDE (OrderDate, TotalAmount)
WITH (ONLINE = ON, FILLFACTOR = 90);
```

**PostgreSQL:**
```sql
CREATE INDEX CONCURRENTLY IX_Orders_CustomerId
ON Orders(customer_id)
INCLUDE (order_date, total_amount);
```

**CosmosDB:**
```json
{
  "indexingPolicy": {
    "compositeIndexes": [
      [
        { "path": "/customerId", "order": "ascending" },
        { "path": "/orderDate", "order": "descending" }
      ]
    ]
  }
}
```

**MongoDB:**
```javascript
db.orders.createIndex(
  { customerId: 1, orderDate: -1 },
  { name: "IX_Orders_CustomerId_OrderDate" }
);
```
