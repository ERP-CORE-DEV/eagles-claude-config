# Security Rules

- Never hardcode secrets, API keys, or connection strings
- Use Azure Key Vault for all sensitive configuration
- No PII in logs (emails, phones, national IDs, addresses)
- Validate all user inputs at system boundaries
- Use parameterized queries (no string concatenation for SQL/NoSQL)
- GDPR compliance mandatory for French HR data entities
- Implement AnonymizeXxx() on all personal data models
- Check IsAnonymized flag before data export
- Use HTTPS for all external communications
- Rotate secrets quarterly minimum
