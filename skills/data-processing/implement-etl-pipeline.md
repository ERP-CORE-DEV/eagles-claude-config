---
name: implement-etl-pipeline
description: Implement ETL (Extract, Transform, Load) pipelines for data integration
argument-hint: [tool: pandas|adf|airflow|spark] [source: csv|api|database]
tags: [data-processing, ETL, pipeline, Pandas, Azure-Data-Factory, Airflow, integration]
---

# ETL Pipeline Implementation Guide

ETL pipelines move and transform data between systems. Common uses: OPCO data exchange, DSN export, candidate import from job boards.

---

## 1. Python (Pandas)

### Basic Pipeline

```python
import pandas as pd
from datetime import datetime

class CandidateImportPipeline:
    def __init__(self, source_path: str, db_connection):
        self.source = source_path
        self.db = db_connection
        self.errors: list[dict] = []

    def extract(self) -> pd.DataFrame:
        df = pd.read_csv(self.source, encoding='utf-8', dtype=str)
        print(f"Extracted {len(df)} records")
        return df

    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        # Normalize names
        df['full_name'] = df['prenom'].str.strip().str.title() + ' ' + df['nom'].str.strip().str.upper()

        # Validate email
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        invalid_emails = ~df['email'].str.match(email_pattern, na=False)
        self.errors.extend(df[invalid_emails][['email']].assign(error='Email invalide').to_dict('records'))
        df = df[~invalid_emails]

        # Normalize phone (French format)
        df['phone'] = df['telephone'].str.replace(r'\s+', '', regex=True)
        df['phone'] = df['phone'].str.replace(r'^0', '+33', regex=True)

        # Deduplicate
        df = df.drop_duplicates(subset=['email'], keep='last')

        # Add metadata
        df['imported_at'] = datetime.utcnow().isoformat()
        df['source'] = 'csv_import'

        print(f"Transformed: {len(df)} valid, {len(self.errors)} errors")
        return df

    def load(self, df: pd.DataFrame) -> int:
        records = df.to_dict('records')
        inserted = 0
        for record in records:
            try:
                self.db.candidates.insert_one(record)
                inserted += 1
            except Exception as e:
                self.errors.append({'record': record.get('email'), 'error': str(e)})
        return inserted

    def run(self) -> dict:
        df = self.extract()
        df = self.transform(df)
        count = self.load(df)
        return {'inserted': count, 'errors': len(self.errors), 'error_details': self.errors}
```

---

## 2. .NET 8

```csharp
public class CandidateImportService(
    ICandidateRepository repo,
    IValidator<CreateCandidateDto> validator,
    ILogger<CandidateImportService> logger)
{
    public async Task<ImportResult> ImportFromCsvAsync(Stream csvStream, CancellationToken ct)
    {
        var result = new ImportResult();
        using var reader = new StreamReader(csvStream);
        using var csv = new CsvReader(reader, new CsvConfiguration(CultureInfo.GetCultureInfo("fr-FR"))
        {
            Delimiter = ";",
            HeaderValidated = null,
            MissingFieldFound = null,
        });

        var records = csv.GetRecords<CandidateCsvRow>().ToList();
        result.TotalRecords = records.Count;

        foreach (var batch in records.Chunk(50))
        {
            foreach (var row in batch)
            {
                var dto = MapToDto(row);
                var validation = await validator.ValidateAsync(dto, ct);
                if (!validation.IsValid)
                {
                    result.Errors.Add(new($"Row {row.Email}: {string.Join(", ", validation.Errors.Select(e => e.ErrorMessage))}"));
                    continue;
                }
                await repo.CreateAsync(dto.ToDomain());
                result.Inserted++;
            }
        }
        return result;
    }
}
```

---

## 3. Azure Data Factory (Declarative)

```json
{
  "name": "CandidateImportPipeline",
  "properties": {
    "activities": [
      {
        "name": "ExtractFromBlob",
        "type": "Copy",
        "inputs": [{ "referenceName": "CsvBlobSource", "type": "DatasetReference" }],
        "outputs": [{ "referenceName": "StagingTable", "type": "DatasetReference" }],
        "typeProperties": {
          "source": { "type": "DelimitedTextSource", "storeSettings": { "type": "AzureBlobStorageReadSettings" } },
          "sink": { "type": "AzureSqlSink", "writeBehavior": "upsert", "upsertSettings": { "useTempDB": true, "keys": ["email"] } }
        }
      },
      {
        "name": "TransformAndValidate",
        "type": "DataFlow",
        "dependsOn": [{ "activity": "ExtractFromBlob", "dependencyConditions": ["Succeeded"] }],
        "typeProperties": { "dataflow": { "referenceName": "CandidateValidationFlow" } }
      }
    ],
    "parameters": { "sourceContainer": { "type": "String", "defaultValue": "imports" } }
  }
}
```

---

## Error Handling Strategy

| Phase | Error Type | Action |
|-------|-----------|--------|
| Extract | File not found / encoding | Fail entire pipeline, alert |
| Extract | Malformed row | Skip row, log error, continue |
| Transform | Validation failure | Skip row, add to error report |
| Transform | Duplicate detected | Keep latest, log dedup |
| Load | DB constraint violation | Skip row, log, continue |
| Load | Connection failure | Retry 3x with backoff, then fail |

## Incremental Loading

```python
# Track last import timestamp
last_import = await db.get_config('last_candidate_import')
new_records = source.query(f"WHERE updated_at > '{last_import}'")
# Process only new/changed records
await pipeline.run(new_records)
await db.set_config('last_candidate_import', datetime.utcnow().isoformat())
```


## Note: Contexte RH Francais

Les pipelines ETL dans les systemes RH francais gerent : import des candidats depuis les jobboards (Indeed, Pole Emploi), export DSN vers l'URSSAF, synchronisation CPF avec la Caisse des Depots, et export des donnees de paie vers les organismes sociaux. Chaque pipeline doit logger les operations pour la conformite CNIL et anonymiser les donnees sensibles (NIR, salaire) lors des exports.
