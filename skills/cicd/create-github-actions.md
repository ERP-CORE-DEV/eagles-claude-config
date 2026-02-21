---
name: create-github-actions
description: Create GitHub Actions workflow for CI/CD pipeline with build, test, and deploy
argument-hint: [platform: azure|aws|docker]
---

# GitHub Actions CI/CD

## .NET + Azure Pipeline
```yaml
# .github/workflows/dotnet.yml
name: .NET CI/CD

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  build-and-test:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v4

    - name: Setup .NET
      uses: actions/setup-dotnet@v4
      with:
        dotnet-version: '8.0.x'

    - name: Restore dependencies
      run: dotnet restore

    - name: Build
      run: dotnet build --no-restore --configuration Release

    - name: Test
      run: dotnet test --no-build --configuration Release --verbosity normal --collect:"XPlat Code Coverage"

    - name: Upload coverage
      uses: codecov/codecov-action@v3

    - name: Publish
      run: dotnet publish --configuration Release --output ./publish

    - name: Upload artifact
      uses: actions/upload-artifact@v4
      with:
        name: webapp
        path: ./publish

  deploy:
    needs: build-and-test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
    - name: Download artifact
      uses: actions/download-artifact@v4
      with:
        name: webapp

    - name: Deploy to Azure Web App
      uses: azure/webapps-deploy@v2
      with:
        app-name: 'my-app-name'
        publish-profile: ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}
        package: .
```

## Node.js Pipeline
```yaml
name: Node.js CI

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v4

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'npm'

    - run: npm ci
    - run: npm run build
    - run: npm test
    - run: npm run lint
```

## Docker Build & Push
```yaml
name: Docker Build

on:
  push:
    branches: [ main ]

jobs:
  docker:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v4

    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v3

    - name: Login to Docker Hub
      uses: docker/login-action@v3
      with:
        username: ${{ secrets.DOCKERHUB_USERNAME }}
        password: ${{ secrets.DOCKERHUB_TOKEN }}

    - name: Build and push
      uses: docker/build-push-action@v5
      with:
        context: .
        push: true
        tags: user/app:latest
        cache-from: type=gha
        cache-to: type=gha,mode=max
```
