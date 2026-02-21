---
name: setup-ci-pipeline
description: Setup CI pipeline with build, test, and deploy stages
platforms: [azure-devops, github-actions, gitlab-ci]
languages: [dotnet, nodejs, python]
---

# Setup CI Pipeline with Build, Test, and Deploy Stages

Comprehensive guide for multi-stage CI/CD pipelines across Azure DevOps, GitHub Actions, and GitLab CI. Covers caching, parallel testing, artifact publishing, Docker builds, environment approvals, and secrets management.

---

## 1. Azure DevOps YAML Pipeline

```yaml
# azure-pipelines.yml
trigger:
  branches:
    include:
      - main
      - develop
      - release/*
  paths:
    exclude:
      - '*.md'
      - docs/

pr:
  branches:
    include:
      - main
      - develop

variables:
  - group: pipeline-secrets          # Variable group linked to Key Vault
  - name: buildConfiguration
    value: 'Release'
  - name: dotnetVersion
    value: '8.0.x'
  - name: nodeVersion
    value: '20.x'
  - name: acrName
    value: 'myregistry'
  - name: imageName
    value: 'myapp'
  - name: imageTag
    value: '$(Build.BuildId)'

pool:
  vmImage: 'ubuntu-latest'

stages:
  # BUILD STAGE
  - stage: Build
    displayName: 'Build and Restore'
    jobs:
      - job: BuildBackend
        displayName: 'Build .NET Backend'
        steps:
          - task: UseDotNet@2
            displayName: 'Install .NET SDK'
            inputs:
              packageType: 'sdk'
              version: '$(dotnetVersion)'

          - task: Cache@2
            displayName: 'Cache NuGet packages'
            inputs:
              key: 'nuget | "$(Agent.OS)" | **/packages.lock.json'
              restoreKeys: |
                nuget | "$(Agent.OS)"
              path: '$(NUGET_PACKAGES)'

          - script: dotnet restore --locked-mode
            displayName: 'Restore NuGet packages'

          - script: dotnet build --configuration $(buildConfiguration) --no-restore
            displayName: 'Build solution'

          - task: PublishPipelineArtifact@1
            displayName: 'Publish build artifacts'
            inputs:
              targetPath: 'src/backend/bin/$(buildConfiguration)'
              artifact: 'backend-build'

      - job: BuildFrontend
        displayName: 'Build React Frontend'
        steps:
          - task: NodeTool@0
            inputs:
              versionSpec: '$(nodeVersion)'

          - task: Cache@2
            displayName: 'Cache npm packages'
            inputs:
              key: 'npm | "$(Agent.OS)" | src/frontend/package-lock.json'
              restoreKeys: |
                npm | "$(Agent.OS)"
              path: 'src/frontend/node_modules'

          - script: |
              cd src/frontend
              npm ci
              npm run build
            displayName: 'Install and build frontend'

          - task: PublishPipelineArtifact@1
            inputs:
              targetPath: 'src/frontend/build'
              artifact: 'frontend-build'

  # TEST STAGE
  - stage: Test
    displayName: 'Test and Analyze'
    dependsOn: Build
    jobs:
      - job: UnitTests
        displayName: 'Unit Tests (parallel)'
        strategy:
          parallel: 3
        steps:
          - task: UseDotNet@2
            inputs:
              packageType: 'sdk'
              version: '$(dotnetVersion)'

          - task: Cache@2
            displayName: 'Cache NuGet packages'
            inputs:
              key: 'nuget | "$(Agent.OS)" | **/packages.lock.json'
              restoreKeys: |
                nuget | "$(Agent.OS)"
              path: '$(NUGET_PACKAGES)'

          - script: dotnet restore --locked-mode
            displayName: 'Restore packages'

          - script: >
              dotnet test
              --configuration $(buildConfiguration)
              --no-restore
              --collect:"XPlat Code Coverage"
              --results-directory $(Agent.TempDirectory)/TestResults
              --logger "trx;LogFileName=testresults.trx"
              -- RunConfiguration.TestSessionTimeout=120000
            displayName: 'Run unit tests with coverage'

          - task: PublishTestResults@2
            displayName: 'Publish test results'
            inputs:
              testResultsFormat: 'VSTest'
              testResultsFiles: '$(Agent.TempDirectory)/TestResults/**/*.trx'
              mergeTestResults: true

          - task: PublishCodeCoverageResults@2
            displayName: 'Publish code coverage'
            inputs:
              summaryFileLocation: '$(Agent.TempDirectory)/TestResults/**/coverage.cobertura.xml'

      - job: FrontendTests
        displayName: 'Frontend Tests'
        steps:
          - task: NodeTool@0
            inputs:
              versionSpec: '$(nodeVersion)'

          - task: Cache@2
            inputs:
              key: 'npm | "$(Agent.OS)" | src/frontend/package-lock.json'
              path: 'src/frontend/node_modules'

          - script: |
              cd src/frontend
              npm ci
              npm run test -- --coverage --ci --reporters=default --reporters=jest-junit
            displayName: 'Run frontend tests'
            env:
              JEST_JUNIT_OUTPUT_DIR: '$(Agent.TempDirectory)/jest-results'

          - task: PublishTestResults@2
            inputs:
              testResultsFormat: 'JUnit'
              testResultsFiles: '$(Agent.TempDirectory)/jest-results/junit.xml'

  # DEPLOY STAGING
  - stage: DeployStaging
    displayName: 'Deploy to Staging'
    dependsOn: Test
    condition: and(succeeded(), eq(variables['Build.SourceBranch'], 'refs/heads/develop'))
    jobs:
      - deployment: DeployToStaging
        displayName: 'Deploy to Staging Environment'
        environment: 'staging'
        strategy:
          runOnce:
            deploy:
              steps:
                - task: AzureCLI@2
                  displayName: 'Build and push Docker image to ACR'
                  inputs:
                    azureSubscription: 'azure-service-connection'
                    scriptType: 'bash'
                    scriptLocation: 'inlineScript'
                    inlineScript: |
                      az acr login --name $(acrName)
                      docker build -t $(acrName).azurecr.io/$(imageName):$(imageTag) -f src/backend/Dockerfile .
                      docker push $(acrName).azurecr.io/$(imageName):$(imageTag)

                - task: HelmDeploy@0
                  displayName: 'Helm upgrade to AKS'
                  inputs:
                    connectionType: 'Azure Resource Manager'
                    azureSubscription: 'azure-service-connection'
                    azureResourceGroup: 'rg-staging'
                    kubernetesCluster: 'aks-staging'
                    namespace: 'app'
                    command: 'upgrade'
                    chartType: 'FilePath'
                    chartPath: 'charts/myapp'
                    releaseName: 'myapp-staging'
                    overrideValues: 'image.tag=$(imageTag),image.repository=$(acrName).azurecr.io/$(imageName)'

  # DEPLOY PRODUCTION
  - stage: DeployProduction
    displayName: 'Deploy to Production'
    dependsOn: DeployStaging
    condition: and(succeeded(), eq(variables['Build.SourceBranch'], 'refs/heads/main'))
    jobs:
      - deployment: DeployToProduction
        displayName: 'Deploy to Production Environment'
        environment: 'production'
        strategy:
          runOnce:
            deploy:
              steps:
                - task: AzureCLI@2
                  displayName: 'Tag image for production'
                  inputs:
                    azureSubscription: 'azure-service-connection'
                    scriptType: 'bash'
                    scriptLocation: 'inlineScript'
                    inlineScript: |
                      az acr login --name $(acrName)
                      docker pull $(acrName).azurecr.io/$(imageName):$(imageTag)
                      docker tag $(acrName).azurecr.io/$(imageName):$(imageTag) $(acrName).azurecr.io/$(imageName):latest
                      docker push $(acrName).azurecr.io/$(imageName):latest

                - task: HelmDeploy@0
                  displayName: 'Helm upgrade to Production AKS'
                  inputs:
                    connectionType: 'Azure Resource Manager'
                    azureSubscription: 'azure-service-connection'
                    azureResourceGroup: 'rg-production'
                    kubernetesCluster: 'aks-production'
                    namespace: 'app'
                    command: 'upgrade'
                    chartType: 'FilePath'
                    chartPath: 'charts/myapp'
                    releaseName: 'myapp-prod'
                    overrideValues: 'image.tag=$(imageTag),image.repository=$(acrName).azurecr.io/$(imageName)'
                    waitForExecution: true
```

---

## 2. GitHub Actions Workflow

```yaml
# .github/workflows/ci-cd.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

env:
  DOTNET_VERSION: '8.0.x'
  NODE_VERSION: '20.x'
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

permissions:
  contents: read
  packages: write
  id-token: write

jobs:
  # BUILD
  build-backend:
    name: Build .NET Backend
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: ${{ env.DOTNET_VERSION }}

      - name: Cache NuGet packages
        uses: actions/cache@v4
        with:
          path: ~/.nuget/packages
          key: nuget-${{ runner.os }}-${{ hashFiles('**/*.csproj', '**/packages.lock.json') }}
          restore-keys: nuget-${{ runner.os }}-

      - run: dotnet restore
      - run: dotnet build --configuration Release --no-restore

      - uses: actions/upload-artifact@v4
        with:
          name: backend-build
          path: src/backend/bin/Release/
          retention-days: 5

  build-frontend:
    name: Build React Frontend
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: src/frontend/package-lock.json

      - run: npm ci
        working-directory: src/frontend

      - run: npm run build
        working-directory: src/frontend

      - uses: actions/upload-artifact@v4
        with:
          name: frontend-build
          path: src/frontend/build/
          retention-days: 5

  # TEST
  test-backend:
    name: Backend Tests
    needs: build-backend
    runs-on: ubuntu-latest
    strategy:
      matrix:
        test-project: [UnitTests, IntegrationTests, PerformanceTests]
      fail-fast: false
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: ${{ env.DOTNET_VERSION }}

      - name: Cache NuGet packages
        uses: actions/cache@v4
        with:
          path: ~/.nuget/packages
          key: nuget-${{ runner.os }}-${{ hashFiles('**/*.csproj', '**/packages.lock.json') }}
          restore-keys: nuget-${{ runner.os }}-

      - run: dotnet restore

      - name: Run ${{ matrix.test-project }}
        run: >
          dotnet test
          --configuration Release
          --no-restore
          --collect:"XPlat Code Coverage"
          --results-directory TestResults
          --logger "trx;LogFileName=${{ matrix.test-project }}.trx"
          --filter "Category=${{ matrix.test-project }}"

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-results-${{ matrix.test-project }}
          path: TestResults/

  test-frontend:
    name: Frontend Tests
    needs: build-frontend
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: src/frontend/package-lock.json

      - run: npm ci
        working-directory: src/frontend

      - run: npm run test -- --coverage --ci
        working-directory: src/frontend

  # DOCKER BUILD + PUSH
  docker-build:
    name: Build and Push Docker Image
    needs: [test-backend, test-frontend]
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    outputs:
      image-tag: ${{ steps.meta.outputs.tags }}
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials (for ECR)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-arn: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: eu-west-3

      - name: Login to Amazon ECR
        id: ecr-login
        uses: aws-actions/amazon-ecr-login@v2

      - name: Docker metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ steps.ecr-login.outputs.registry }}/myapp
          tags: |
            type=sha,prefix=
            type=ref,event=branch
            type=semver,pattern={{version}}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          file: src/backend/Dockerfile
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # DEPLOY STAGING
  deploy-staging:
    name: Deploy to Staging
    needs: docker-build
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    environment:
      name: staging
      url: https://staging.myapp.example.com
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to Kubernetes
        uses: azure/k8s-deploy@v5
        with:
          namespace: app-staging
          manifests: k8s/staging/
          images: ${{ needs.docker-build.outputs.image-tag }}

  # DEPLOY PRODUCTION
  deploy-production:
    name: Deploy to Production
    needs: deploy-staging
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://myapp.example.com
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to Kubernetes
        uses: azure/k8s-deploy@v5
        with:
          namespace: app-production
          manifests: k8s/production/
          images: ${{ needs.docker-build.outputs.image-tag }}
```

---

## 3. GitLab CI Pipeline

```yaml
# .gitlab-ci.yml
stages:
  - build
  - test
  - docker
  - deploy

variables:
  DOTNET_VERSION: "8.0"
  NODE_VERSION: "20"
  DOCKER_IMAGE: "$CI_REGISTRY_IMAGE"
  DOCKER_TAG: "$CI_COMMIT_SHORT_SHA"
  PIP_CACHE_DIR: "$CI_PROJECT_DIR/.cache/pip"

# CACHING TEMPLATES
.nuget-cache: &nuget-cache
  cache:
    key:
      files:
        - "**/*.csproj"
    paths:
      - .nuget/
    policy: pull-push

.npm-cache: &npm-cache
  cache:
    key:
      files:
        - src/frontend/package-lock.json
    paths:
      - src/frontend/node_modules/
    policy: pull-push

.pip-cache: &pip-cache
  cache:
    key:
      files:
        - requirements.txt
    paths:
      - .cache/pip/
    policy: pull-push

# BUILD STAGE
build-backend:
  stage: build
  image: mcr.microsoft.com/dotnet/sdk:8.0
  <<: *nuget-cache
  script:
    - dotnet restore --packages .nuget/
    - dotnet build --configuration Release --no-restore
  artifacts:
    paths:
      - src/backend/bin/Release/
    expire_in: 1 day

build-frontend:
  stage: build
  image: node:20-alpine
  <<: *npm-cache
  script:
    - cd src/frontend
    - npm ci
    - npm run build
  artifacts:
    paths:
      - src/frontend/build/
    expire_in: 1 day

build-python:
  stage: build
  image: python:3.12-slim
  <<: *pip-cache
  script:
    - pip install -r requirements.txt
    - python -m compileall src/
  rules:
    - exists:
        - requirements.txt

# TEST STAGE
test-backend:
  stage: test
  image: mcr.microsoft.com/dotnet/sdk:8.0
  <<: *nuget-cache
  needs: ["build-backend"]
  parallel: 3
  script:
    - dotnet restore --packages .nuget/
    - >
      dotnet test
      --configuration Release
      --no-restore
      --collect:"XPlat Code Coverage"
      --results-directory TestResults
      --logger "junit;LogFilePath=TestResults/junit-{assembly}.xml"
  artifacts:
    when: always
    paths:
      - TestResults/
    reports:
      junit: TestResults/junit-*.xml
      coverage_report:
        coverage_format: cobertura
        path: TestResults/**/coverage.cobertura.xml
  coverage: '/Total\s*\|\s*(\d+\.?\d*)%/'

test-frontend:
  stage: test
  image: node:20-alpine
  <<: *npm-cache
  needs: ["build-frontend"]
  script:
    - cd src/frontend
    - npm ci
    - npm run test -- --coverage --ci --reporters=default --reporters=jest-junit
  artifacts:
    when: always
    reports:
      junit: src/frontend/junit.xml
      coverage_report:
        coverage_format: cobertura
        path: src/frontend/coverage/cobertura-coverage.xml
  coverage: '/All files\s*\|\s*(\d+\.?\d*)/'

test-python:
  stage: test
  image: python:3.12-slim
  <<: *pip-cache
  needs: ["build-python"]
  script:
    - pip install -r requirements.txt
    - pip install pytest pytest-cov pytest-xdist
    - pytest -n auto --cov=src --cov-report=xml:coverage.xml --junitxml=report.xml
  artifacts:
    reports:
      junit: report.xml
      coverage_report:
        coverage_format: cobertura
        path: coverage.xml
  rules:
    - exists:
        - requirements.txt

# DOCKER STAGE
docker-build:
  stage: docker
  image: docker:24
  services:
    - docker:24-dind
  needs: ["test-backend", "test-frontend"]
  before_script:
    - docker login -u "$CI_REGISTRY_USER" -p "$CI_REGISTRY_PASSWORD" $CI_REGISTRY
  script:
    - docker build -t "$DOCKER_IMAGE:$DOCKER_TAG" -f src/backend/Dockerfile .
    - docker tag "$DOCKER_IMAGE:$DOCKER_TAG" "$DOCKER_IMAGE:latest"
    - docker push "$DOCKER_IMAGE:$DOCKER_TAG"
    - docker push "$DOCKER_IMAGE:latest"
  rules:
    - if: $CI_COMMIT_BRANCH == "main" || $CI_COMMIT_BRANCH == "develop"

# DEPLOY STAGE
deploy-staging:
  stage: deploy
  image: bitnami/kubectl:latest
  needs: ["docker-build"]
  environment:
    name: staging
    url: https://staging.myapp.example.com
  script:
    - kubectl set image deployment/myapp myapp="$DOCKER_IMAGE:$DOCKER_TAG" -n staging
    - kubectl rollout status deployment/myapp -n staging --timeout=300s
  rules:
    - if: $CI_COMMIT_BRANCH == "develop"

deploy-production:
  stage: deploy
  image: bitnami/kubectl:latest
  needs: ["deploy-staging"]
  environment:
    name: production
    url: https://myapp.example.com
  script:
    - kubectl set image deployment/myapp myapp="$DOCKER_IMAGE:$DOCKER_TAG" -n production
    - kubectl rollout status deployment/myapp -n production --timeout=300s
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
      when: manual
      allow_failure: false
```

---

## 4. Best Practices Reference

### Caching strategies

| Platform       | Tool     | Cache key recommendation                                   |
|----------------|----------|-------------------------------------------------------------|
| Azure DevOps   | Cache@2  | `nuget \| "$(Agent.OS)" \| **/packages.lock.json`          |
| GitHub Actions | cache@v4 | `nuget-${{ runner.os }}-${{ hashFiles('**/*.csproj') }}`    |
| GitLab CI      | cache:   | `key: { files: [package-lock.json] }`                       |

### Pipeline variables and secrets

- **Azure DevOps**: Use Variable Groups linked to Azure Key Vault. Mark sensitive values as secret. Reference with `$(variableName)`.
- **GitHub Actions**: Store secrets in Settings > Secrets and variables > Actions. Reference with `${{ secrets.SECRET_NAME }}`. Use OIDC for cloud provider auth instead of long-lived credentials.
- **GitLab CI**: Configure CI/CD variables at project or group level. Mark as "Protected" and "Masked". Use Vault integration for dynamic secrets.

### Environment approvals

- **Azure DevOps**: Configure approval gates on Environments in Pipelines > Environments > Approvals and checks.
- **GitHub Actions**: Set required reviewers on environments in Settings > Environments > Protection rules.
- **GitLab CI**: Use `when: manual` combined with `allow_failure: false` on deploy jobs. Configure Protected Environments for approval workflows.

### Parallel test execution

- **Azure DevOps**: Use `strategy: parallel: N` on jobs. Tests are distributed automatically across agents.
- **GitHub Actions**: Use `strategy: matrix` with test project or shard identifiers. Combine with `fail-fast: false` to run all shards even if one fails.
- **GitLab CI**: Use `parallel: N` keyword. Tests are split across N jobs. Use `--test-partition` flags where supported.

### Docker image build and push

- Always tag images with both the commit SHA and a semantic label (branch name, `latest`, semver).
- Use multi-stage Dockerfiles to keep final images small.
- Leverage build cache (Docker layer caching on CI, `cache-from: type=gha` on GitHub Actions).
- For ACR: use `az acr login` or service principal credentials. For ECR: use OIDC role assumption via `aws-actions/configure-aws-credentials`.

### Artifact publishing

- Publish build outputs as pipeline artifacts for downstream stages to consume.
- Set retention policies (1-5 days for CI artifacts, longer for release artifacts).
- Publish test results and coverage reports as structured artifacts so the CI platform renders them in the UI.
