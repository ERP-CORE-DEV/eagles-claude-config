---
name: add-data-encryption
description: Implement data encryption at rest and in transit with Azure Key Vault integration for French CNIL/GDPR compliance
argument-hint: "[encryption-scope] [key-rotation-days]"
tags: [security, encryption, gdpr, azure-key-vault, data-protection]
---

# Add Data Encryption

Implements comprehensive data encryption strategy for sensitive French HR data (NIR, salary, health records) with Azure Key Vault, field-level encryption, and CNIL compliance.

## When to Use

✅ **Use encryption when:**
- Storing Personally Identifiable Information (PII): NIR, salary, health data
- CNIL/GDPR compliance requires data protection
- French HR context: Données de paie, dossier médical, données disciplinaires
- Database backups contain sensitive information
- Transmitting data over networks (TLS/HTTPS)

❌ **Avoid field-level encryption when:**
- Data is already protected by database encryption (e.g., Cosmos DB encryption at rest)
- Performance is critical and data is low-sensitivity (public job postings)
- Encryption complicates necessary queries (consider tokenization instead)

## Encryption Strategies

| Strategy | Use Case | Performance | Searchability |
|----------|----------|-------------|---------------|
| **Transparent DB Encryption** | All data at rest | ✅ Fast | ✅ Full |
| **Field-level Encryption** | Specific PII fields | ⚠ Moderate | ❌ Limited |
| **Envelope Encryption** | Large files/documents | ✅ Fast | ❌ None |
| **Tokenization** | Credit cards, NIR | ✅ Fast | ✅ By token |

## Implementation

### .NET 8 (ASP.NET Core with Azure Key Vault)

**1. Install packages:**
```bash
dotnet add package Azure.Security.KeyVault.Keys --version 4.5.0
dotnet add package Azure.Identity --version 1.10.0
dotnet add package Microsoft.AspNetCore.DataProtection.AzureKeyVault --version 8.0.0
```

**2. Configure Azure Key Vault in Program.cs:**
```csharp
using Azure.Identity;
using Azure.Security.KeyVault.Keys;
using Azure.Security.KeyVault.Keys.Cryptography;
using Microsoft.AspNetCore.DataProtection;

var builder = WebApplication.CreateBuilder(args);

// Azure Key Vault configuration
var keyVaultUri = new Uri(builder.Configuration["AzureKeyVault:VaultUri"]!);
var credential = new DefaultAzureCredential(); // Uses managed identity in Azure

// Add Data Protection with Key Vault
builder.Services.AddDataProtection()
    .PersistKeysToAzureBlobStorage(new Uri($"{keyVaultUri}/keys/data-protection-keys"))
    .ProtectKeysWithAzureKeyVault(new Uri($"{keyVaultUri}/keys/data-protection-master-key"), credential);

// Register Key Vault services
builder.Services.AddSingleton(new KeyClient(keyVaultUri, credential));
builder.Services.AddSingleton<IEncryptionService, EncryptionService>();

var app = builder.Build();
app.Run();
```

**3. Encryption Service:**
```csharp
// Services/Encryption/IEncryptionService.cs
public interface IEncryptionService
{
    Task<string> EncryptAsync(string plainText, string keyName);
    Task<string> DecryptAsync(string cipherText, string keyName);
    string EncryptDeterministic(string plainText); // For searchable fields
    string DecryptDeterministic(string cipherText);
}

// Services/Encryption/EncryptionService.cs
using Azure.Security.KeyVault.Keys;
using Azure.Security.KeyVault.Keys.Cryptography;
using System.Text;
using System.Security.Cryptography;

public class EncryptionService : IEncryptionService
{
    private readonly KeyClient _keyClient;
    private readonly IConfiguration _configuration;
    private readonly byte[] _deterministicKey; // For searchable encryption

    public EncryptionService(KeyClient keyClient, IConfiguration configuration)
    {
        _keyClient = keyClient;
        _configuration = configuration;

        // Load deterministic key from Key Vault or config
        var keyBase64 = configuration["Encryption:DeterministicKey"];
        _deterministicKey = Convert.FromBase64String(keyBase64!);
    }

    public async Task<string> EncryptAsync(string plainText, string keyName)
    {
        if (string.IsNullOrEmpty(plainText))
            return plainText;

        try
        {
            var key = await _keyClient.GetKeyAsync(keyName);
            var cryptoClient = new CryptographyClient(key.Value.Id, new DefaultAzureCredential());

            var plainBytes = Encoding.UTF8.GetBytes(plainText);
            var encryptResult = await cryptoClient.EncryptAsync(
                EncryptionAlgorithm.RsaOaep256,
                plainBytes
            );

            return Convert.ToBase64String(encryptResult.Ciphertext);
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException($"Encryption failed: {ex.Message}", ex);
        }
    }

    public async Task<string> DecryptAsync(string cipherText, string keyName)
    {
        if (string.IsNullOrEmpty(cipherText))
            return cipherText;

        try
        {
            var key = await _keyClient.GetKeyAsync(keyName);
            var cryptoClient = new CryptographyClient(key.Value.Id, new DefaultAzureCredential());

            var cipherBytes = Convert.FromBase64String(cipherText);
            var decryptResult = await cryptoClient.DecryptAsync(
                EncryptionAlgorithm.RsaOaep256,
                cipherBytes
            );

            return Encoding.UTF8.GetString(decryptResult.Plaintext);
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException($"Decryption failed: {ex.Message}", ex);
        }
    }

    // Deterministic encryption for searchable fields (e.g., email, NIR lookup)
    public string EncryptDeterministic(string plainText)
    {
        if (string.IsNullOrEmpty(plainText))
            return plainText;

        using var aes = Aes.Create();
        aes.Key = _deterministicKey;
        aes.Mode = CipherMode.ECB; // Deterministic (same input = same output)
        aes.Padding = PaddingMode.PKCS7;

        using var encryptor = aes.CreateEncryptor();
        var plainBytes = Encoding.UTF8.GetBytes(plainText);
        var cipherBytes = encryptor.TransformFinalBlock(plainBytes, 0, plainBytes.Length);

        return Convert.ToBase64String(cipherBytes);
    }

    public string DecryptDeterministic(string cipherText)
    {
        if (string.IsNullOrEmpty(cipherText))
            return cipherText;

        using var aes = Aes.Create();
        aes.Key = _deterministicKey;
        aes.Mode = CipherMode.ECB;
        aes.Padding = PaddingMode.PKCS7;

        using var decryptor = aes.CreateDecryptor();
        var cipherBytes = Convert.FromBase64String(cipherText);
        var plainBytes = decryptor.TransformFinalBlock(cipherBytes, 0, cipherBytes.Length);

        return Encoding.UTF8.GetString(plainBytes);
    }
}
```

**4. Domain Model with Encryption:**
```csharp
// Domain/Models/Employee.cs
using System.Text.Json.Serialization;

public class Employee
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;

    // Encrypted fields (stored as Base64)
    [JsonIgnore] // Never serialize to JSON
    public string NirEncrypted { get; set; } = string.Empty; // Numéro de Sécurité Sociale

    [JsonIgnore]
    public string SalaryEncrypted { get; set; } = string.Empty; // Monthly salary in EUR

    [JsonIgnore]
    public string IbanEncrypted { get; set; } = string.Empty; // Bank account (IBAN)

    // Decrypted properties (not stored in DB)
    [NotMapped]
    [JsonProperty("nir")]
    public string? Nir { get; set; }

    [NotMapped]
    [JsonProperty("salary")]
    public decimal? Salary { get; set; }

    [NotMapped]
    [JsonProperty("iban")]
    public string? Iban { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    // GDPR anonymization
    public bool IsAnonymized { get; set; }
}
```

**5. Repository with Automatic Encryption:**
```csharp
// Repositories/EmployeeRepository.cs
public class EmployeeRepository : IEmployeeRepository
{
    private readonly CosmosClient _cosmosClient;
    private readonly Container _container;
    private readonly IEncryptionService _encryptionService;
    private const string EncryptionKeyName = "employee-data-key"; // Azure Key Vault key name

    public EmployeeRepository(
        CosmosClient cosmosClient,
        IConfiguration configuration,
        IEncryptionService encryptionService)
    {
        _cosmosClient = cosmosClient;
        _encryptionService = encryptionService;

        var databaseName = configuration["CosmosDb:DatabaseName"];
        _container = _cosmosClient.GetContainer(databaseName, "Employees");
    }

    public async Task<Employee> CreateAsync(Employee employee)
    {
        // Encrypt sensitive fields before storing
        if (!string.IsNullOrEmpty(employee.Nir))
            employee.NirEncrypted = await _encryptionService.EncryptAsync(employee.Nir, EncryptionKeyName);

        if (employee.Salary.HasValue)
            employee.SalaryEncrypted = await _encryptionService.EncryptAsync(
                employee.Salary.Value.ToString("F2"), EncryptionKeyName);

        if (!string.IsNullOrEmpty(employee.Iban))
            employee.IbanEncrypted = await _encryptionService.EncryptAsync(employee.Iban, EncryptionKeyName);

        // Clear plaintext values
        employee.Nir = null;
        employee.Salary = null;
        employee.Iban = null;

        await _container.CreateItemAsync(employee, new PartitionKey(employee.Id));
        return employee;
    }

    public async Task<Employee?> GetByIdAsync(string id)
    {
        try
        {
            var response = await _container.ReadItemAsync<Employee>(id, new PartitionKey(id));
            var employee = response.Resource;

            // Decrypt sensitive fields
            if (!string.IsNullOrEmpty(employee.NirEncrypted))
                employee.Nir = await _encryptionService.DecryptAsync(employee.NirEncrypted, EncryptionKeyName);

            if (!string.IsNullOrEmpty(employee.SalaryEncrypted))
            {
                var salaryStr = await _encryptionService.DecryptAsync(employee.SalaryEncrypted, EncryptionKeyName);
                employee.Salary = decimal.Parse(salaryStr);
            }

            if (!string.IsNullOrEmpty(employee.IbanEncrypted))
                employee.Iban = await _encryptionService.DecryptAsync(employee.IbanEncrypted, EncryptionKeyName);

            return employee;
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    // Find by NIR using deterministic encryption for lookup
    public async Task<Employee?> FindByNirAsync(string nir)
    {
        // Encrypt search term with deterministic algorithm
        var encryptedNir = _encryptionService.EncryptDeterministic(nir);

        var query = new QueryDefinition(
            "SELECT * FROM c WHERE c.nirEncrypted = @nirEncrypted"
        ).WithParameter("@nirEncrypted", encryptedNir);

        var iterator = _container.GetItemQueryIterator<Employee>(query);
        var results = await iterator.ReadNextAsync();

        return results.FirstOrDefault();
    }
}
```

### Node.js/TypeScript (with Azure Key Vault)

**1. Install packages:**
```bash
npm install @azure/keyvault-keys @azure/identity crypto
```

**2. Encryption Service:**
```typescript
// services/encryptionService.ts
import { KeyClient, CryptographyClient } from '@azure/keyvault-keys';
import { DefaultAzureCredential } from '@azure/identity';
import crypto from 'crypto';

export class EncryptionService {
  private keyClient: KeyClient;
  private deterministicKey: Buffer;

  constructor() {
    const vaultUrl = process.env.AZURE_KEYVAULT_URL!;
    const credential = new DefaultAzureCredential();

    this.keyClient = new KeyClient(vaultUrl, credential);
    this.deterministicKey = Buffer.from(process.env.DETERMINISTIC_KEY!, 'base64');
  }

  async encrypt(plainText: string, keyName: string): Promise<string> {
    if (!plainText) return plainText;

    const key = await this.keyClient.getKey(keyName);
    const cryptoClient = new CryptographyClient(key, new DefaultAzureCredential());

    const plainBytes = Buffer.from(plainText, 'utf-8');
    const encryptResult = await cryptoClient.encrypt({
      algorithm: 'RSA-OAEP-256',
      plaintext: plainBytes
    });

    return Buffer.from(encryptResult.result).toString('base64');
  }

  async decrypt(cipherText: string, keyName: string): Promise<string> {
    if (!cipherText) return cipherText;

    const key = await this.keyClient.getKey(keyName);
    const cryptoClient = new CryptographyClient(key, new DefaultAzureCredential());

    const cipherBytes = Buffer.from(cipherText, 'base64');
    const decryptResult = await cryptoClient.decrypt({
      algorithm: 'RSA-OAEP-256',
      ciphertext: cipherBytes
    });

    return Buffer.from(decryptResult.result).toString('utf-8');
  }

  // Deterministic encryption for searchable fields
  encryptDeterministic(plainText: string): string {
    if (!plainText) return plainText;

    const cipher = crypto.createCipheriv('aes-256-ecb', this.deterministicKey, null);
    let encrypted = cipher.update(plainText, 'utf-8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
  }

  decryptDeterministic(cipherText: string): string {
    if (!cipherText) return cipherText;

    const decipher = crypto.createDecipheriv('aes-256-ecb', this.deterministicKey, null);
    let decrypted = decipher.update(cipherText, 'base64', 'utf-8');
    decrypted += decipher.final('utf-8');
    return decrypted;
  }
}
```

## Azure Key Vault Configuration

**1. Create Key Vault:**
```bash
az keyvault create \
  --name kv-rh-optimerp \
  --resource-group rg-rh-optimerp \
  --location westeurope \
  --enable-soft-delete true \
  --enable-purge-protection true
```

**2. Create encryption keys:**
```bash
# RSA key for envelope encryption
az keyvault key create \
  --vault-name kv-rh-optimerp \
  --name employee-data-key \
  --kty RSA \
  --size 2048

# Symmetric key for deterministic encryption (store as secret)
az keyvault secret set \
  --vault-name kv-rh-optimerp \
  --name deterministic-encryption-key \
  --value $(openssl rand -base64 32)
```

**3. Assign Managed Identity permissions:**
```bash
az keyvault set-policy \
  --name kv-rh-optimerp \
  --object-id <APP_MANAGED_IDENTITY_ID> \
  --key-permissions get encrypt decrypt \
  --secret-permissions get
```

## French HR / CNIL Compliance

**Article 32 GDPR - Security Measures:**
✅ Encryption of personal data (NIR, salary, health records)
✅ Key rotation every 90 days
✅ Separate encryption keys per data classification
✅ Audit trail of encryption/decryption operations

**Sensitive Data Categories (France):**
```csharp
public enum DataClassification
{
    Public,           // Job postings, company info
    Internal,         // Employee directory (name, email)
    Confidential,     // Salary, performance reviews
    HighlyConfidential // NIR, health data, disciplinary records
}

// Map to encryption keys
private string GetKeyName(DataClassification classification) => classification switch
{
    DataClassification.HighlyConfidential => "hr-highly-confidential-key",
    DataClassification.Confidential => "hr-confidential-key",
    _ => null // No encryption needed
};
```

## Performance Considerations

**Optimization strategies:**
1. **Encrypt only sensitive fields** (not entire documents)
2. **Use deterministic encryption for searchable fields** (email, NIR)
3. **Cache decrypted data in memory** (with TTL)
4. **Async encryption for large payloads**

```csharp
// Cache decrypted NIR for 5 minutes
private readonly IMemoryCache _cache;

public async Task<string> GetDecryptedNirAsync(string employeeId)
{
    var cacheKey = $"nir_{employeeId}";

    if (!_cache.TryGetValue(cacheKey, out string nir))
    {
        var employee = await _repository.GetByIdAsync(employeeId);
        nir = await _encryptionService.DecryptAsync(employee.NirEncrypted, "employee-data-key");

        _cache.Set(cacheKey, nir, TimeSpan.FromMinutes(5));
    }

    return nir;
}
```

## Testing

```csharp
[Fact]
public async Task EncryptDecrypt_RoundTrip_ReturnsOriginalValue()
{
    // Arrange
    var service = new EncryptionService(_keyClient, _configuration);
    var plainText = "1 85 03 75 116 238 91"; // NIR example

    // Act
    var encrypted = await service.EncryptAsync(plainText, "employee-data-key");
    var decrypted = await service.DecryptAsync(encrypted, "employee-data-key");

    // Assert
    Assert.NotEqual(plainText, encrypted); // Encrypted is different
    Assert.Equal(plainText, decrypted); // Decryption restores original
}

[Fact]
public void DeterministicEncryption_SameInput_ProducesSameOutput()
{
    // Arrange
    var service = new EncryptionService(_keyClient, _configuration);
    var plainText = "user@company.fr";

    // Act
    var encrypted1 = service.EncryptDeterministic(plainText);
    var encrypted2 = service.EncryptDeterministic(plainText);

    // Assert
    Assert.Equal(encrypted1, encrypted2); // Deterministic property
}
```

## Related Skills

- `/setup-azure-key-vault` - Configure Azure Key Vault
- `/implement-gdpr-compliance` - Full GDPR compliance
- `/add-audit-logging` - Track encryption operations
