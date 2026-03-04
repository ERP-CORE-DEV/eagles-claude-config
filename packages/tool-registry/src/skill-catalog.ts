/**
 * Unified skill catalog — 59 skills total.
 * 26 from Classic + 33 from Phase A (global expansion).
 *
 * Each skill includes category, tags, prerequisites (AND/OR), and estimated minutes.
 */

import type { PrerequisiteMode } from "./prerequisites.js";

export interface SkillEntry {
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly tags: readonly string[];
  readonly serverName: string;
  readonly prerequisites: readonly string[];
  readonly prerequisiteMode: PrerequisiteMode;
  readonly estimatedMinutes: number;
}

// ---------------------------------------------------------------------------
// Classic skills (26)
// ---------------------------------------------------------------------------

const CLASSIC_SKILLS: readonly SkillEntry[] = [
  { name: "code_review", description: "Review code for quality, security, and maintainability", category: "quality", tags: ["review", "security"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },
  { name: "security_scan", description: "Run security vulnerability scan (SAST/DAST)", category: "security", tags: ["scan", "sast", "dast"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 10 },
  { name: "build_fix", description: "Fix build errors with minimal changes", category: "devops", tags: ["build", "fix"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },
  { name: "generate_crud", description: "Generate complete CRUD operations for an entity", category: "codegen", tags: ["crud", "scaffold"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 8 },
  { name: "generate_component", description: "Generate React component with TypeScript, tests, and styles", category: "codegen", tags: ["react", "component", "frontend"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },
  { name: "generate_service", description: "Generate .NET service with interface, implementation, and DI registration", category: "codegen", tags: ["dotnet", "service"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },
  { name: "generate_endpoint", description: "Generate a single API endpoint with controller action, service method, and test", category: "codegen", tags: ["api", "endpoint"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },
  { name: "generate_test_data", description: "Generate realistic test data with Bogus or Faker.js", category: "testing", tags: ["test", "data", "faker"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 3 },
  { name: "tdd_guide", description: "Start TDD workflow RED-GREEN-REFACTOR", category: "testing", tags: ["tdd", "test"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 15 },
  { name: "e2e_test", description: "Generate E2E tests with Playwright", category: "testing", tags: ["e2e", "playwright"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 10 },
  { name: "test_coverage", description: "Analyze and improve test coverage", category: "testing", tags: ["coverage", "test"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },
  { name: "helm_deploy", description: "Deploy to AKS via Helm with health checks", category: "deploy", tags: ["helm", "aks", "azure"], serverName: "orchestrator-mcp", prerequisites: ["azure_pipeline"], prerequisiteMode: "and", estimatedMinutes: 10 },
  { name: "azure_pipeline", description: "Generate Azure Pipelines YAML with 4 stages", category: "devops", tags: ["azure", "ci", "pipeline"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 8 },
  { name: "generate_dockerfile", description: "Generate optimized multi-stage Dockerfile", category: "devops", tags: ["docker", "container"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },
  { name: "generate_helm_chart", description: "Generate Helm chart for Kubernetes deployment", category: "deploy", tags: ["helm", "kubernetes"], serverName: "orchestrator-mcp", prerequisites: ["generate_dockerfile"], prerequisiteMode: "and", estimatedMinutes: 8 },
  { name: "configure_secrets", description: "Setup Azure Key Vault and Kubernetes secrets", category: "security", tags: ["keyvault", "secrets", "azure"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },
  { name: "gdpr_check", description: "Verify GDPR/CNIL compliance on entities", category: "compliance", tags: ["gdpr", "cnil", "privacy"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },
  { name: "french_hr_validate", description: "Validate French HR compliance requirements", category: "compliance", tags: ["french", "hr", "smic"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },
  { name: "db_review", description: "Review CosmosDB queries and schema", category: "database", tags: ["cosmosdb", "review"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },
  { name: "plan_feature", description: "Create implementation plan for a feature", category: "planning", tags: ["plan", "feature"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 10 },
  { name: "architect_review", description: "Architecture review and ADR generation", category: "architecture", tags: ["adr", "review"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 10 },
  { name: "scaffold_microservice", description: "Scaffold a complete microservice with Controller-Service-Repository pattern", category: "codegen", tags: ["scaffold", "microservice"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 15 },
  { name: "diagnose_error", description: "Interactive error diagnosis with auto-routing", category: "devops", tags: ["debug", "error"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },
  { name: "refactor_clean", description: "Remove dead code and cleanup", category: "quality", tags: ["refactor", "cleanup"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 10 },
  { name: "update_docs", description: "Universal documentation generator", category: "docs", tags: ["docs", "documentation"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 10 },
  { name: "perf_test", description: "Generate and run performance tests with K6", category: "testing", tags: ["performance", "k6"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 10 },
];

// ---------------------------------------------------------------------------
// Phase A — Language skills (14)
// ---------------------------------------------------------------------------

const LANGUAGE_SKILLS: readonly SkillEntry[] = [
  // Java (4)
  { name: "java_review", description: "Java code review — Spring Boot, JPA, virtual threads", category: "language", tags: ["java", "review", "spring"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },
  { name: "generate_spring_boot", description: "Spring Boot CRUD scaffold with Controller-Service-Repository", category: "codegen", tags: ["java", "spring", "scaffold"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 10 },
  { name: "java_test", description: "JUnit5 test generation with AssertJ and Mockito", category: "testing", tags: ["java", "junit5", "test"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },
  { name: "generate_gradle", description: "Gradle build config with multi-module support", category: "devops", tags: ["java", "gradle", "build"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },

  // Rust (3)
  { name: "rust_review", description: "Rust code review — ownership, lifetimes, cargo", category: "language", tags: ["rust", "review"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },
  { name: "generate_cargo", description: "Cargo project scaffold with workspace support", category: "codegen", tags: ["rust", "cargo", "scaffold"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },
  { name: "rust_test", description: "Rust test patterns — unit, integration, doc tests", category: "testing", tags: ["rust", "test"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },

  // Ruby (3)
  { name: "ruby_review", description: "Ruby/Rails code review — conventions, gems", category: "language", tags: ["ruby", "rails", "review"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },
  { name: "generate_rails", description: "Rails scaffold with MVC, ActiveRecord, migrations", category: "codegen", tags: ["ruby", "rails", "scaffold"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 10 },
  { name: "ruby_test", description: "RSpec test patterns with FactoryBot", category: "testing", tags: ["ruby", "rspec", "test"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },

  // PHP (3)
  { name: "php_review", description: "PHP/Laravel code review — PSR-12, PHP 8.3+", category: "language", tags: ["php", "laravel", "review"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },
  { name: "generate_laravel", description: "Laravel scaffold with Eloquent, migrations, API resources", category: "codegen", tags: ["php", "laravel", "scaffold"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 10 },
  { name: "php_test", description: "PHPUnit/Pest test patterns for Laravel", category: "testing", tags: ["php", "phpunit", "test"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },

  // Go (existing agent, new skill entry)
  { name: "go_review", description: "Go idiomatic review with concurrency checks", category: "language", tags: ["go", "review"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },
];

// ---------------------------------------------------------------------------
// Phase A — Cloud + IaC + Config Management skills (10)
// ---------------------------------------------------------------------------

const CLOUD_SKILLS: readonly SkillEntry[] = [
  { name: "aws_deploy", description: "AWS deployment — EKS, ECS, Lambda, CDK", category: "deploy", tags: ["aws", "eks", "lambda"], serverName: "orchestrator-mcp", prerequisites: ["terraform_validate"], prerequisiteMode: "or", estimatedMinutes: 15 },
  { name: "gcp_deploy", description: "GCP deployment — GKE, Cloud Run, Artifact Registry", category: "deploy", tags: ["gcp", "gke", "cloudrun"], serverName: "orchestrator-mcp", prerequisites: ["terraform_validate"], prerequisiteMode: "or", estimatedMinutes: 15 },
  { name: "ibm_deploy", description: "IBM Cloud deployment — IKS/OpenShift, Code Engine", category: "deploy", tags: ["ibm", "openshift", "codeengine"], serverName: "orchestrator-mcp", prerequisites: ["terraform_validate"], prerequisiteMode: "or", estimatedMinutes: 15 },
  { name: "aws_pipeline", description: "AWS CodePipeline + CodeBuild CI/CD", category: "devops", tags: ["aws", "codepipeline", "ci"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 10 },
  { name: "gcp_pipeline", description: "GCP Cloud Build CI/CD", category: "devops", tags: ["gcp", "cloudbuild", "ci"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 10 },
  { name: "ibm_pipeline", description: "IBM Cloud Continuous Delivery toolchain — Tekton", category: "devops", tags: ["ibm", "tekton", "ci"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 10 },
  { name: "github_actions", description: "GitHub Actions workflow generation — build, test, deploy matrix", category: "devops", tags: ["github", "actions", "ci"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 8 },
  { name: "terraform_validate", description: "Terraform/OpenTofu HCL validation, plan review, state management", category: "iac", tags: ["terraform", "iac", "hcl"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 10 },
  { name: "ansible_playbook", description: "Ansible playbook generation + validation", category: "iac", tags: ["ansible", "playbook", "config"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 10 },
  { name: "ansible_review", description: "Ansible best practices review — lint, vault, idempotency", category: "iac", tags: ["ansible", "review", "lint"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },
];

// ---------------------------------------------------------------------------
// Phase A — Database skills (12)
// ---------------------------------------------------------------------------

const DATABASE_SKILLS: readonly SkillEntry[] = [
  // SQL (4)
  { name: "postgresql_review", description: "PostgreSQL query optimization, indexing, partitioning", category: "database", tags: ["postgresql", "sql", "index"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },
  { name: "mysql_review", description: "MySQL/MariaDB query optimization, InnoDB tuning", category: "database", tags: ["mysql", "sql", "index"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },
  { name: "sqlserver_review", description: "SQL Server execution plans, columnstore, query store", category: "database", tags: ["sqlserver", "sql", "index"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },
  { name: "oracle_review", description: "Oracle PL/SQL review, explain plans, partitioning", category: "database", tags: ["oracle", "sql", "plsql"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },

  // NoSQL (3)
  { name: "mongodb_review", description: "MongoDB aggregation pipelines, indexing, sharding", category: "database", tags: ["mongodb", "nosql", "aggregation"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },
  { name: "dynamodb_review", description: "DynamoDB single-table design, GSI/LSI, capacity planning", category: "database", tags: ["dynamodb", "nosql", "aws"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },
  { name: "firestore_review", description: "Firestore security rules, collection structure, indexes", category: "database", tags: ["firestore", "nosql", "gcp"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },

  // Cache + Search + Graph (3)
  { name: "redis_review", description: "Redis data structures, persistence, sentinel/cluster", category: "database", tags: ["redis", "cache", "pub-sub"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },
  { name: "elasticsearch_review", description: "Elasticsearch mappings, query DSL, ILM", category: "database", tags: ["elasticsearch", "search", "index"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },
  { name: "neo4j_review", description: "Neo4j Cypher optimization, graph modeling, GDS", category: "database", tags: ["neo4j", "graph", "cypher"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },

  // Cross-cutting (2)
  { name: "db_migration", description: "Database migration patterns — Flyway, Alembic, EF, Prisma, Knex", category: "database", tags: ["migration", "flyway", "alembic"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 8 },
  { name: "db_test", description: "Database testing — Testcontainers, fixtures, seeding", category: "testing", tags: ["database", "testcontainers", "test"], serverName: "orchestrator-mcp", prerequisites: [], prerequisiteMode: "and", estimatedMinutes: 5 },
];

// ---------------------------------------------------------------------------
// Full catalog
// ---------------------------------------------------------------------------

export const SKILL_CATALOG: readonly SkillEntry[] = [
  ...CLASSIC_SKILLS,
  ...LANGUAGE_SKILLS,
  ...CLOUD_SKILLS,
  ...DATABASE_SKILLS,
];

export const CLASSIC_SKILL_COUNT = CLASSIC_SKILLS.length;
export const LANGUAGE_SKILL_COUNT = LANGUAGE_SKILLS.length;
export const CLOUD_SKILL_COUNT = CLOUD_SKILLS.length;
export const DATABASE_SKILL_COUNT = DATABASE_SKILLS.length;
export const TOTAL_SKILL_COUNT = SKILL_CATALOG.length;
