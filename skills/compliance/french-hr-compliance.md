---
name: french-hr-compliance
description: Implement French HR regulatory compliance including CNIL, GDPR, Code du travail, CPF, OPCO, and DSN integration
argument-hint: "[compliance-scope] [data-category]"
tags: [compliance, french-hr, cnil, gdpr, code-du-travail, cpf, opco, dsn]
---

# French HR Compliance

Comprehensive guide for implementing French HR regulatory compliance in software systems, covering CNIL data protection, Code du travail, social security (NIR), CPF training, OPCO financing, and DSN declarations.

## Regulatory Framework

| Regulation | Scope | Key Requirements |
|-----------|-------|-----------------|
| **CNIL/GDPR** | Personal data protection | Consent, minimization, retention, right to erasure |
| **Code du travail** | Employment law | Contract types, working hours, leave, dismissal |
| **DSN** | Social declarations | Monthly electronic declaration to URSSAF |
| **CPF** | Training rights | Personal training account management |
| **OPCO** | Training financing | Operator financing for professional training |
| **Convention Collective** | Sector agreements | Industry-specific rules (metallurgy, commerce, etc.) |

## Implementation

### 1. NIR Validation (Numero de Securite Sociale)

**Format:** `X YY MM DD CCC OOO KK` (15 digits)
- X: Gender (1=Male, 2=Female)
- YY: Birth year
- MM: Birth month (01-12, or 20-42 for overseas)
- DD: Birth department (01-95, 2A/2B for Corsica, 97x for DOM-TOM)
- CCC: Commune code
- OOO: Birth order number
- KK: Control key (97 - (first 13 digits mod 97))

```csharp
// Domain/Validation/NirValidator.cs
namespace Sourcing.CandidateAttraction.Domain.Validation
{
    public static class NirValidator
    {
        public static bool IsValid(string nir)
        {
            if (string.IsNullOrEmpty(nir)) return false;

            // Remove spaces and dots
            var cleaned = nir.Replace(" ", "").Replace(".", "");
            if (cleaned.Length != 15) return false;

            // Handle Corsica (2A, 2B)
            var nirForCalc = cleaned;
            if (cleaned[5] == 'A')
                nirForCalc = cleaned.Replace("A", "0");
            else if (cleaned[5] == 'B')
                nirForCalc = cleaned.Replace("B", "0");

            // Extract body and key
            if (!long.TryParse(nirForCalc.Substring(0, 13), out long body)) return false;
            if (!int.TryParse(nirForCalc.Substring(13, 2), out int key)) return false;

            // Corsica adjustment
            if (cleaned[5] == 'A') body -= 1000000;
            else if (cleaned[5] == 'B') body -= 2000000;

            // Control key: 97 - (body mod 97)
            var expectedKey = 97 - (int)(body % 97);
            return key == expectedKey;
        }

        // Gender extraction
        public static string GetGender(string nir)
        {
            var first = nir.Replace(" ", "")[0];
            return first == '1' ? "Homme" : first == '2' ? "Femme" : "Inconnu";
        }

        // Birth department extraction
        public static string GetBirthDepartment(string nir)
        {
            var cleaned = nir.Replace(" ", "");
            return cleaned.Substring(5, 2);
        }
    }
}
```

```typescript
// validation/nirValidator.ts
export class NirValidator {
  static isValid(nir: string): boolean {
    if (!nir) return false;
    const cleaned = nir.replace(/[\s.]/g, '');
    if (cleaned.length !== 15) return false;

    let nirForCalc = cleaned;
    if (cleaned[5] === 'A') nirForCalc = cleaned.replace('A', '0');
    else if (cleaned[5] === 'B') nirForCalc = cleaned.replace('B', '0');

    const bodyStr = nirForCalc.substring(0, 13);
    const keyStr = nirForCalc.substring(13, 15);

    let body = BigInt(bodyStr);
    const key = parseInt(keyStr, 10);

    // Corsica adjustment
    if (cleaned[5] === 'A') body -= BigInt(1000000);
    else if (cleaned[5] === 'B') body -= BigInt(2000000);

    const expectedKey = 97 - Number(body % BigInt(97));
    return key === expectedKey;
  }
}
```

### 2. Contract Types (Types de Contrat)

```csharp
// Domain/Enums/ContractType.cs
public enum ContractType
{
    CDI,        // Contrat a Duree Indeterminee (permanent)
    CDD,        // Contrat a Duree Determinee (fixed-term)
    CDIC,       // CDI de Chantier (project-based permanent)
    Interim,    // Travail Temporaire (agency work)
    Stage,      // Stage (internship)
    Alternance, // Contrat d'Alternance (apprenticeship/work-study)
    CTT,        // Contrat de Travail Temporaire
    Saisonnier  // Contrat Saisonnier (seasonal)
}

// Domain/Validation/ContractValidator.cs
public static class ContractValidator
{
    // CDD maximum durations (Code du travail L1242-8)
    public static readonly Dictionary<string, int> MaxDurationMonths = new()
    {
        { "CDD_Standard", 18 },
        { "CDD_Remplacement", 18 },
        { "CDD_Saisonnier", 8 },
        { "CDD_Usage", 18 },
        { "CDD_Senior", 36 }  // CDD senior (> 57 ans)
    };

    // Trial period durations (Code du travail L1221-19)
    public static readonly Dictionary<ContractType, int> TrialPeriodDays = new()
    {
        { ContractType.CDI, 60 },       // Ouvriers/Employes: 2 months
        { ContractType.CDD, 14 },       // CDD < 6 mois: 1 jour/semaine (max 14j)
        { ContractType.Stage, 0 },      // No trial period
        { ContractType.Alternance, 45 } // 45 days
    };

    public static bool ValidateTrialPeriod(ContractType type, int durationDays)
    {
        return TrialPeriodDays.TryGetValue(type, out int maxDays) && durationDays <= maxDays;
    }
}
```

### 3. SMIC Validation (Salaire Minimum)

```csharp
// Domain/Validation/SmicValidator.cs
public static class SmicValidator
{
    // SMIC horaire brut 2025 (update annually)
    public const decimal SmicHoraireBrut2025 = 11.88m;
    public const decimal SmicMensuelBrut2025 = 1801.80m; // 151.67h * 11.88
    public const decimal PlafondSecuriteSociale2025 = 3864m; // Mensuel

    public static bool IsAboveSmic(decimal monthlySalaryBrut)
    {
        return monthlySalaryBrut >= SmicMensuelBrut2025;
    }

    // Calculate employer social contributions
    public static decimal CalculateEmployerContributions(decimal grossSalary)
    {
        decimal contributions = 0;

        // Assurance maladie: 13% (reduced to 7% if salary < 2.5 SMIC)
        if (grossSalary <= SmicMensuelBrut2025 * 2.5m)
            contributions += grossSalary * 0.07m;
        else
            contributions += grossSalary * 0.13m;

        // Assurance vieillesse: 8.55% (plafonned) + 1.90% (deplafonne)
        contributions += Math.Min(grossSalary, PlafondSecuriteSociale2025) * 0.0855m;
        contributions += grossSalary * 0.019m;

        // Allocations familiales: 5.25% (reduced to 3.45% if < 3.5 SMIC)
        if (grossSalary <= SmicMensuelBrut2025 * 3.5m)
            contributions += grossSalary * 0.0345m;
        else
            contributions += grossSalary * 0.0525m;

        // Chomage: 4.05%
        contributions += grossSalary * 0.0405m;

        return Math.Round(contributions, 2);
    }
}
```

### 4. GDPR/CNIL Data Protection

```csharp
// Services/Gdpr/IGdprService.cs
public interface IGdprService
{
    Task<bool> RecordConsentAsync(string userId, string purpose, bool granted);
    Task AnonymizeUserDataAsync(string userId, string reason);
    Task<UserDataExport> ExportUserDataAsync(string userId); // Right of access (Art. 15)
    Task DeleteUserDataAsync(string userId, string reason);  // Right to erasure (Art. 17)
    Task<IReadOnlyList<ProcessingActivity>> GetProcessingLogAsync(); // Art. 30
}

// Services/Gdpr/GdprService.cs
public class GdprService : IGdprService
{
    private readonly IConsentRepository _consentRepo;
    private readonly ICandidateRepository _candidateRepo;
    private readonly IChangeTrackingService _changeTracking;
    private readonly ILogger<GdprService> _logger;

    public async Task AnonymizeUserDataAsync(string userId, string reason)
    {
        _logger.LogInformation("GDPR Anonymization requested for user {UserId}: {Reason}", userId, reason);

        // Anonymize all entities containing user PII
        var candidate = await _candidateRepo.GetByIdAsync(userId);
        if (candidate != null)
        {
            var originalName = $"{candidate.FirstName} {candidate.LastName}";
            candidate.Anonymize(); // Sets IsAnonymized = true

            await _candidateRepo.UpdateAsync(candidate);
            await _changeTracking.TrackUpdateAsync(
                new { Name = originalName },
                new { Name = "***ANONYMISE***" },
                "SYSTEM_GDPR",
                $"GDPR anonymization: {reason}"
            );
        }
    }

    public async Task<UserDataExport> ExportUserDataAsync(string userId)
    {
        // GDPR Art. 15: Right of access - export all user data
        var candidate = await _candidateRepo.GetByIdAsync(userId);
        var consents = await _consentRepo.GetByUserAsync(userId);
        var changeHistory = await _changeTracking.GetHistoryAsync(userId);

        return new UserDataExport
        {
            PersonalData = candidate,
            Consents = consents,
            ProcessingHistory = changeHistory,
            ExportedAt = DateTime.UtcNow,
            ExportedBy = "SYSTEM_GDPR"
        };
    }

    public async Task<bool> RecordConsentAsync(string userId, string purpose, bool granted)
    {
        var consent = new Consent
        {
            UserId = userId,
            Purpose = purpose,
            Granted = granted,
            RecordedAt = DateTime.UtcNow,
            IpAddress = "***MASQUE***" // Don't store IP for CNIL compliance
        };

        await _consentRepo.CreateAsync(consent);
        return true;
    }
}
```

### 5. CPF (Compte Personnel de Formation)

```csharp
// Domain/Models/CpfAccount.cs
public class CpfAccount
{
    public string EmployeeId { get; set; } = string.Empty;
    public decimal BalanceEuros { get; set; } // Max 5000 EUR (8000 for low-qualified)
    public decimal AnnualCreditEuros { get; set; } = 500m; // 500 EUR/year (800 for low-qualified)
    public decimal CeilingEuros { get; set; } = 5000m;

    // Check if training is CPF-eligible
    public bool CanFinanceTraining(decimal trainingCost)
    {
        return BalanceEuros >= trainingCost;
    }

    // Annual credit calculation
    public void ApplyAnnualCredit(bool isLowQualified)
    {
        var credit = isLowQualified ? 800m : 500m;
        var ceiling = isLowQualified ? 8000m : 5000m;
        BalanceEuros = Math.Min(BalanceEuros + credit, ceiling);
    }
}
```

### 6. DSN (Declaration Sociale Nominative)

```csharp
// Services/Dsn/DsnExportService.cs
public class DsnExportService
{
    // DSN structure blocks (norme NEODES)
    public async Task<string> GenerateMonthlyDsnAsync(string companyId, int month, int year)
    {
        var employees = await _employeeRepo.GetActiveByCompanyAsync(companyId);

        var dsn = new StringBuilder();

        // Block S10: Emitter identification
        dsn.AppendLine($"S10.G00.00.001,'{companyId}'");   // SIRET
        dsn.AppendLine($"S10.G00.00.002,'RH-OptimERP'");    // Software name
        dsn.AppendLine($"S10.G00.00.003,'3.0'");             // Software version

        // Block S20: Company declaration
        dsn.AppendLine($"S20.G00.05.001,'{year:D4}{month:D2}'"); // Declaration period
        dsn.AppendLine($"S20.G00.05.002,'01'");                    // Nature (monthly)

        foreach (var employee in employees)
        {
            // Block S21: Employee identity
            dsn.AppendLine($"S21.G00.06.001,'{employee.Nir}'");              // NIR
            dsn.AppendLine($"S21.G00.06.002,'{employee.LastName}'");         // Nom
            dsn.AppendLine($"S21.G00.06.003,'{employee.FirstName}'");        // Prenom

            // Block S21: Contract
            dsn.AppendLine($"S21.G00.40.001,'{employee.ContractStartDate:yyyy-MM-dd}'");
            dsn.AppendLine($"S21.G00.40.002,'{GetDsnContractCode(employee.ContractType)}'");

            // Block S21: Remuneration
            dsn.AppendLine($"S21.G00.51.001,'{employee.GrossSalary:F2}'");   // Brut
            dsn.AppendLine($"S21.G00.51.002,'{GetPayPeriod(month, year)}'"); // Period
        }

        return dsn.ToString();
    }

    private string GetDsnContractCode(ContractType type) => type switch
    {
        ContractType.CDI => "01",
        ContractType.CDD => "02",
        ContractType.Alternance => "04",
        ContractType.Stage => "29",
        ContractType.Interim => "03",
        _ => "01"
    };
}
```

### 7. Data Retention Policies

```csharp
public static class CnilRetentionPolicies
{
    public static readonly Dictionary<string, TimeSpan> Policies = new()
    {
        { "recruitment_data", TimeSpan.FromDays(365 * 2) },       // 2 years
        { "payroll_data", TimeSpan.FromDays(365 * 5) },           // 5 years (Code du travail)
        { "social_security", TimeSpan.FromDays(365 * 5) },        // 5 years
        { "time_attendance", TimeSpan.FromDays(365) },             // 1 year
        { "medical_records", TimeSpan.FromDays(365 * 50) },        // 50 years
        { "disciplinary_records", TimeSpan.FromDays(365 * 3) },    // 3 years
        { "training_records", TimeSpan.FromDays(365 * 6) },        // 6 years (CPF)
        { "audit_logs", TimeSpan.FromDays(365 * 6) },              // 6 years (fiscal)
        { "video_surveillance", TimeSpan.FromDays(30) },           // 30 days
        { "access_logs", TimeSpan.FromDays(180) }                  // 6 months
    };
}
```

### 8. React Consent Component (French)

```typescript
// components/ConsentBanner.tsx
import React, { useState } from 'react';
import { Modal, Checkbox, Button, Typography, Space } from 'antd';

const { Text, Title } = Typography;

interface ConsentProps {
  onAccept: (consents: Record<string, boolean>) => void;
  onDecline: () => void;
}

export const ConsentBanner: React.FC<ConsentProps> = ({ onAccept, onDecline }) => {
  const [consents, setConsents] = useState({
    essential: true,      // Always required
    analytics: false,
    marketing: false,
    thirdParty: false
  });

  return (
    <Modal
      title="Protection de vos donnees personnelles"
      open={true}
      closable={false}
      footer={null}
      width={600}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Text>
          Conformement au RGPD et a la loi Informatique et Libertes,
          nous vous informons que vos donnees personnelles sont traitees
          pour la gestion de votre candidature.
        </Text>

        <Checkbox checked disabled>
          Cookies essentiels (obligatoire)
        </Checkbox>
        <Checkbox
          checked={consents.analytics}
          onChange={e => setConsents({ ...consents, analytics: e.target.checked })}
        >
          Cookies analytiques - Mesure d'audience
        </Checkbox>
        <Checkbox
          checked={consents.thirdParty}
          onChange={e => setConsents({ ...consents, thirdParty: e.target.checked })}
        >
          Partage avec des tiers - Partenaires OPCO
        </Checkbox>

        <Space>
          <Button type="primary" onClick={() => onAccept(consents)}>
            Accepter la selection
          </Button>
          <Button onClick={() => onAccept({ essential: true, analytics: true, marketing: true, thirdParty: true })}>
            Tout accepter
          </Button>
          <Button danger onClick={onDecline}>
            Tout refuser
          </Button>
        </Space>

        <Text type="secondary" style={{ fontSize: 12 }}>
          Responsable du traitement : RH-OptimERP | DPO : dpo@rh-optimerp.fr
          | Vous disposez d'un droit d'acces, de rectification et de suppression.
        </Text>
      </Space>
    </Modal>
  );
};
```

## Testing

```csharp
[Theory]
[InlineData("1 85 03 75 116 238 91", true)]   // Valid male NIR
[InlineData("2 90 12 2A 123 456 78", false)]   // Check Corsica handling
[InlineData("1234567890123", false)]            // Too short
[InlineData("", false)]                         // Empty
public void NirValidator_ValidatesCorrectly(string nir, bool expected)
{
    Assert.Equal(expected, NirValidator.IsValid(nir));
}

[Fact]
public void SmicValidator_AboveSmic_ReturnsTrue()
{
    Assert.True(SmicValidator.IsAboveSmic(2000m)); // Above SMIC
    Assert.False(SmicValidator.IsAboveSmic(1500m)); // Below SMIC
}

[Fact]
public void ContractValidator_CddMaxDuration_Valid()
{
    Assert.True(ContractValidator.MaxDurationMonths["CDD_Standard"] == 18);
    Assert.True(ContractValidator.MaxDurationMonths["CDD_Senior"] == 36);
}
```

## Related Skills

- `/add-data-encryption` - Encrypt NIR and salary data
- `/add-audit-fields` - CNIL audit trail
- `/implement-change-tracking` - Track data modifications
- `/add-role-based-auth` - French HR role hierarchy
