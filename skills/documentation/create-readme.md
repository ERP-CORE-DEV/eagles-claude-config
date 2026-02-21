---
name: create-readme
description: Create comprehensive README with setup, usage, and contribution guidelines
argument-hint: [type: library|api|fullstack|microservice]
tags: [documentation, README, onboarding, setup, contributing]
---

# README Template Guide

A good README is the first thing developers see. It should answer: What is this? How do I run it? How do I contribute?

---

## Template Structure

```markdown
# Project Name

Brief one-line description of what this project does.

## Quick Start

Prerequisites, installation, and first run in under 5 commands.

## Architecture

High-level diagram and key design decisions.

## Development

### Prerequisites
- Node.js 20+
- .NET 8 SDK
- Docker Desktop

### Setup
git clone <repo>
cd <project>
cp .env.example .env
docker-compose up -d
dotnet run

### Testing
dotnet test
npm test

## API Reference

Link to Swagger/OpenAPI docs or inline key endpoints.

## Deployment

How to deploy (CI/CD pipeline, manual steps).

## Contributing

1. Fork the repo
2. Create feature branch
3. Write tests
4. Submit PR

## License

MIT / Apache 2.0 / Proprietary
```

---

## Key Sections

| Section | Required | Purpose |
|---------|----------|---------|
| Title + description | Yes | What is this? |
| Quick Start | Yes | Get running in 2 minutes |
| Prerequisites | Yes | What do I need installed? |
| Architecture | For complex projects | How does it work? |
| API Reference | For APIs | How do I use it? |
| Environment Variables | If any | What config is needed? |
| Testing | Yes | How do I run tests? |
| Deployment | For services | How do I deploy? |
| Contributing | For open source | How do I contribute? |
| License | Yes | Can I use this? |

---

## Tips

- Include badges (build status, coverage, version)
- Use code blocks for all commands
- Link to detailed docs (don't put everything in README)
- Keep it under 500 lines
- Update it when things change
