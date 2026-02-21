---
name: prevent-sql-injection
description: Implement SQL injection prevention using parameterized queries, ORMs, and input sanitization
argument-hint: [database: sql-server|postgres|mysql|oracle]
---

# Prevent SQL Injection

Protect against SQL injection attacks using secure coding practices.

## What is SQL Injection?

SQL injection occurs when untrusted user input is concatenated directly into SQL queries, allowing attackers to execute arbitrary SQL commands.

## Attack Example

```csharp
// VULNERABLE CODE - NEVER DO THIS
public async Task<User> GetUserByEmail(string email)
{
    var query = $"SELECT * FROM Users WHERE Email = '{email}'";
    var result = await _db.ExecuteQueryAsync(query);
    return result.FirstOrDefault();
}

// Attacker input: "admin@example.com' OR '1'='1"
// Resulting query: SELECT * FROM Users WHERE Email = 'admin@example.com' OR '1'='1'
// Result: Returns ALL users!
```

## Prevention Methods

### 1. Parameterized Queries (Best Practice)

#### .NET/ADO.NET
```csharp
public async Task<User> GetUserByEmail(string email)
{
    var query = "SELECT * FROM Users WHERE Email = @Email";

    using var command = new SqlCommand(query, connection);
    command.Parameters.AddWithValue("@Email", email);

    using var reader = await command.ExecuteReaderAsync();
    // Process results
}
```

#### .NET/Entity Framework Core
```csharp
public async Task<User> GetUserByEmail(string email)
{
    // EF Core automatically uses parameters - safe by default
    return await _dbContext.Users
        .Where(u => u.Email == email)
        .FirstOrDefaultAsync();
}

// For raw SQL, still use parameters
public async Task<List<User>> SearchUsers(string searchTerm)
{
    return await _dbContext.Users
        .FromSqlRaw("SELECT * FROM Users WHERE Name LIKE @p0", $"%{searchTerm}%")
        .ToListAsync();
}
```

### 2. Node.js/PostgreSQL (node-postgres)

```javascript
// SECURE: Parameterized query
async function getUserByEmail(email) {
  const query = 'SELECT * FROM users WHERE email = $1';
  const result = await pool.query(query, [email]);
  return result.rows[0];
}

// SECURE: Multiple parameters
async function createUser(name, email, age) {
  const query = 'INSERT INTO users (name, email, age) VALUES ($1, $2, $3) RETURNING *';
  const result = await pool.query(query, [name, email, age]);
  return result.rows[0];
}

// VULNERABLE - Never concatenate
async function badGetUser(email) {
  const query = `SELECT * FROM users WHERE email = '${email}'`; // BAD!
  const result = await pool.query(query);
  return result.rows[0];
}
```

### 3. Node.js/MySQL (mysql2)

```javascript
// SECURE: Prepared statements
async function getUserByEmail(email) {
  const [rows] = await connection.execute(
    'SELECT * FROM users WHERE email = ?',
    [email]
  );
  return rows[0];
}

// SECURE: Named placeholders
async function updateUser(id, name, email) {
  const [result] = await connection.execute(
    'UPDATE users SET name = :name, email = :email WHERE id = :id',
    { id, name, email }
  );
  return result.affectedRows;
}
```

### 4. Python/SQLAlchemy (ORM - Safe by Default)

```python
from sqlalchemy.orm import Session

# SECURE: ORM query
def get_user_by_email(email: str) -> User:
    with Session(engine) as session:
        return session.query(User).filter(User.email == email).first()

# SECURE: Parameterized raw SQL
def search_users(search_term: str) -> List[User]:
    query = text("SELECT * FROM users WHERE name LIKE :search")
    with Session(engine) as session:
        result = session.execute(query, {"search": f"%{search_term}%"})
        return result.fetchall()
```

### 5. Python/psycopg2 (PostgreSQL)

```python
import psycopg2

# SECURE: Parameter substitution
def get_user_by_email(cursor, email):
    query = "SELECT * FROM users WHERE email = %s"
    cursor.execute(query, (email,))
    return cursor.fetchone()

# SECURE: Multiple parameters
def create_user(cursor, name, email, age):
    query = "INSERT INTO users (name, email, age) VALUES (%s, %s, %s) RETURNING id"
    cursor.execute(query, (name, email, age))
    return cursor.fetchone()[0]

# VULNERABLE - Never use string formatting
def bad_get_user(cursor, email):
    query = f"SELECT * FROM users WHERE email = '{email}'"  # BAD!
    cursor.execute(query)
    return cursor.fetchone()
```

### 6. Java/JDBC Prepared Statements

```java
// SECURE: PreparedStatement
public User getUserByEmail(String email) throws SQLException {
    String query = "SELECT * FROM users WHERE email = ?";

    try (PreparedStatement stmt = connection.prepareStatement(query)) {
        stmt.setString(1, email);

        try (ResultSet rs = stmt.executeQuery()) {
            if (rs.next()) {
                return new User(
                    rs.getInt("id"),
                    rs.getString("name"),
                    rs.getString("email")
                );
            }
        }
    }
    return null;
}

// VULNERABLE - Never concatenate
public User badGetUser(String email) throws SQLException {
    String query = "SELECT * FROM users WHERE email = '" + email + "'"; // BAD!
    Statement stmt = connection.createStatement();
    ResultSet rs = stmt.executeQuery(query);
    // ...
}
```

## Additional Security Measures

### Input Validation

```csharp
public async Task<User> GetUserByEmail(string email)
{
    // Validate input before using
    if (string.IsNullOrWhiteSpace(email))
        throw new ArgumentException("Email is required");

    if (!IsValidEmail(email))
        throw new ArgumentException("Invalid email format");

    // Even with validation, ALWAYS use parameters
    return await _dbContext.Users
        .Where(u => u.Email == email)
        .FirstOrDefaultAsync();
}

private bool IsValidEmail(string email)
{
    return Regex.IsMatch(email, @"^[^@\s]+@[^@\s]+\.[^@\s]+$");
}
```

### Stored Procedures (Additional Layer)

```csharp
// Call stored procedure (parameters are still used)
public async Task<User> GetUserByEmail(string email)
{
    return await _dbContext.Users
        .FromSqlRaw("EXEC GetUserByEmail @Email", new SqlParameter("@Email", email))
        .FirstOrDefaultAsync();
}
```

### Whitelist Allowed Values

```csharp
public async Task<List<User>> GetUsersByRole(string role)
{
    // Whitelist allowed roles
    var allowedRoles = new[] { "admin", "user", "guest" };
    if (!allowedRoles.Contains(role.ToLower()))
        throw new ArgumentException("Invalid role");

    return await _dbContext.Users
        .Where(u => u.Role == role)
        .ToListAsync();
}
```

### Escaping Special Characters (Last Resort)

```csharp
// Only use if parameterization is impossible (very rare)
public string EscapeSqlInput(string input)
{
    if (string.IsNullOrEmpty(input))
        return input;

    // Replace single quotes with two single quotes
    return input.Replace("'", "''");
}

// But still prefer parameterized queries!
```

## Dynamic Queries (Dangerous - Avoid)

```csharp
// If you MUST build dynamic queries, use safe patterns:
public async Task<List<User>> SearchUsers(string searchField, string searchValue)
{
    // Whitelist allowed fields
    var allowedFields = new[] { "Name", "Email", "Department" };
    if (!allowedFields.Contains(searchField))
        throw new ArgumentException("Invalid search field");

    // Use parameters for the value
    var query = $"SELECT * FROM Users WHERE {searchField} LIKE @SearchValue";

    return await _dbContext.Users
        .FromSqlRaw(query, new SqlParameter("@SearchValue", $"%{searchValue}%"))
        .ToListAsync();
}
```

## Common Mistakes to Avoid

### ❌ String Concatenation
```csharp
// NEVER DO THIS
var query = $"SELECT * FROM Users WHERE Email = '{email}'";
var query = "SELECT * FROM Users WHERE Email = '" + email + "'";
```

### ❌ String Interpolation in Raw SQL
```csharp
// NEVER DO THIS
var query = $"SELECT * FROM Users WHERE Email = '{email}'";
await _dbContext.Database.ExecuteSqlRawAsync(query);
```

### ❌ Trusting User Input
```csharp
// NEVER DO THIS - even if you "validated" it
if (IsValidEmail(email)) // Validation can be bypassed
{
    var query = $"SELECT * FROM Users WHERE Email = '{email}'"; // Still vulnerable!
}
```

### ✅ Always Use Parameters
```csharp
// ALWAYS DO THIS
var query = "SELECT * FROM Users WHERE Email = @Email";
await _dbContext.Users
    .FromSqlRaw(query, new SqlParameter("@Email", email))
    .ToListAsync();

// Or use LINQ (automatically parameterized)
await _dbContext.Users.Where(u => u.Email == email).ToListAsync();
```

## Testing for SQL Injection

### Test Inputs
- `admin' OR '1'='1`
- `'; DROP TABLE Users; --`
- `admin'--`
- `1' UNION SELECT * FROM Users--`

### Expected Behavior
- Parameterized queries treat these as literal strings
- No SQL execution, just a failed lookup
- Application should not crash or expose errors

## SAST Tools for Detection

- **SonarQube**: Detects string concatenation in SQL
- **Fortify**: Static analysis for security vulnerabilities
- **Checkmarx**: SAST scanning
- **Semgrep**: Open-source security scanner

## Summary

### ✅ Safe Practices
1. Use ORM (EF Core, Hibernate, SQLAlchemy)
2. Use parameterized queries for raw SQL
3. Validate and sanitize input
4. Whitelist allowed values
5. Use stored procedures
6. Principle of least privilege (database permissions)

### ❌ Unsafe Practices
1. String concatenation of SQL
2. String interpolation in queries
3. Trusting user input
4. Dynamic SQL without whitelisting
5. Exposing raw error messages

**Golden Rule**: Never trust user input. Always use parameters.
