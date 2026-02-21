---
name: create-dockerfile
description: Create optimized Dockerfile with multi-stage builds, layer caching, and security best practices
argument-hint: [stack: dotnet|node|python|java|go]
---

# Create Dockerfile

Generate production-ready Dockerfile with multi-stage builds and optimization.

## Multi-Stage Build Benefits

1. **Smaller images**: Only production dependencies in final image
2. **Faster builds**: Layer caching
3. **Security**: No build tools in production image
4. **Separation**: Build and runtime environments isolated

## .NET 8 Dockerfile

```dockerfile
# syntax=docker/dockerfile:1

# ==== Build Stage ====
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy csproj and restore dependencies (cached layer)
COPY ["src/backend/CandidateMatchingEngine/CandidateMatchingEngine.csproj", "CandidateMatchingEngine/"]
RUN dotnet restore "CandidateMatchingEngine/CandidateMatchingEngine.csproj"

# Copy source code and build
COPY src/backend/CandidateMatchingEngine/. CandidateMatchingEngine/
WORKDIR "/src/CandidateMatchingEngine"
RUN dotnet build "CandidateMatchingEngine.csproj" -c Release -o /app/build

# ==== Publish Stage ====
FROM build AS publish
RUN dotnet publish "CandidateMatchingEngine.csproj" -c Release -o /app/publish /p:UseAppHost=false

# ==== Runtime Stage ====
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# Create non-root user
RUN adduser --disabled-password --gecos "" appuser && chown -R appuser /app
USER appuser

# Copy published app
COPY --from=publish /app/publish .

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Expose port
EXPOSE 8080

# Set environment
ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production

# Entry point
ENTRYPOINT ["dotnet", "CandidateMatchingEngine.dll"]
```

## Node.js Dockerfile

```dockerfile
# syntax=docker/dockerfile:1

# ==== Build Stage ====
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies (cached layer)
COPY package.json package-lock.json ./
RUN npm ci --only=production && \
    npm cache clean --force

# Copy source and build
COPY . .
RUN npm run build

# ==== Runtime Stage ====
FROM node:20-alpine AS runtime
WORKDIR /app

# Install dumb-init (proper signal handling)
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy dependencies and build output
COPY --from=build --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /app/dist ./dist
COPY --from=build --chown=nodejs:nodejs /app/package.json ./

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

# Expose port
EXPOSE 3000

# Environment
ENV NODE_ENV=production
ENV PORT=3000

# Entry point with dumb-init
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
```

## Python/Flask Dockerfile

```dockerfile
# syntax=docker/dockerfile:1

# ==== Build Stage ====
FROM python:3.11-slim AS build
WORKDIR /app

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# ==== Runtime Stage ====
FROM python:3.11-slim AS runtime
WORKDIR /app

# Copy Python dependencies
COPY --from=build /root/.local /root/.local

# Create non-root user
RUN useradd --create-home --shell /bin/bash appuser && \
    chown -R appuser:appuser /app
USER appuser

# Add local bin to PATH
ENV PATH=/root/.local/bin:$PATH

# Copy application
COPY --chown=appuser:appuser . .

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python healthcheck.py

# Expose port
EXPOSE 5000

# Environment
ENV FLASK_ENV=production
ENV PYTHONUNBUFFERED=1

# Run with gunicorn (production WSGI server)
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "4", "app:app"]
```

## React/Vite Frontend Dockerfile

```dockerfile
# syntax=docker/dockerfile:1

# ==== Build Stage ====
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Build application
COPY . .
RUN npm run build

# ==== Runtime Stage (Nginx) ====
FROM nginx:alpine AS runtime

# Copy built files
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Health check
HEALTHCHECK --interval=30s --timeout=3s CMD wget --quiet --tries=1 --spider http://localhost:80/health || exit 1

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
```

```nginx
# nginx.conf
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
```

## Docker Compose for Development

```yaml
# docker-compose.yml
version: '3.8'

services:
  backend:
    build:
      context: .
      dockerfile: src/backend/Dockerfile
      target: build # Use build stage for dev
    ports:
      - "5000:5000"
    environment:
      - ASPNETCORE_ENVIRONMENT=Development
      - CosmosDb__ConnectionString=${COSMOS_CONNECTION_STRING}
    volumes:
      - ./src/backend:/app:ro # Hot reload
    depends_on:
      - cosmos-emulator

  frontend:
    build:
      context: .
      dockerfile: src/frontend/Dockerfile
      target: build
    ports:
      - "3000:3000"
    environment:
      - VITE_API_URL=http://localhost:5000
    volumes:
      - ./src/frontend:/app:ro
      - /app/node_modules # Prevent overwriting

  cosmos-emulator:
    image: mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator
    ports:
      - "8081:8081"
    environment:
      - AZURE_COSMOS_EMULATOR_PARTITION_COUNT=10
      - AZURE_COSMOS_EMULATOR_ENABLE_DATA_PERSISTENCE=true
    volumes:
      - cosmos-data:/data

volumes:
  cosmos-data:
```

## .dockerignore

```
# .dockerignore
# Dependencies
node_modules
npm-debug.log
__pycache__
*.pyc
.pytest_cache

# Build output
dist
build
out
bin
obj
*.dll
*.exe

# IDE
.vscode
.idea
*.swp
*.swo

# Git
.git
.gitignore
.gitattributes

# Documentation
*.md
docs

# Tests
tests
*.test.js
*.spec.js

# Environment
.env
.env.local
*.local

# CI/CD
.github
.gitlab-ci.yml
azure-pipelines.yml

# Misc
Dockerfile
docker-compose.yml
.dockerignore
README.md
LICENSE
```

## Build and Run Commands

```bash
# Build image
docker build -t myapp:latest .

# Build with build args
docker build --build-arg NODE_ENV=production -t myapp:latest .

# Multi-platform build
docker buildx build --platform linux/amd64,linux/arm64 -t myapp:latest .

# Run container
docker run -d -p 8080:8080 --name myapp myapp:latest

# Run with environment variables
docker run -d -p 8080:8080 \
  -e DATABASE_URL=postgres://... \
  -e API_KEY=xxx \
  --name myapp myapp:latest

# View logs
docker logs -f myapp

# Execute command in container
docker exec -it myapp /bin/sh

# Stop and remove
docker stop myapp && docker rm myapp
```

## Optimization Tips

### 1. Layer Caching
```dockerfile
# ✅ GOOD: Copy package files first (cache dependencies)
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ❌ BAD: Copy all files first (breaks cache on any change)
COPY . .
RUN npm ci && npm run build
```

### 2. Minimize Image Size
```dockerfile
# Use alpine base images
FROM node:20-alpine  # 40 MB vs node:20 (900 MB)

# Clean up in same layer
RUN apt-get update && \
    apt-get install -y package && \
    rm -rf /var/lib/apt/lists/*

# Remove dev dependencies
RUN npm ci --only=production
```

### 3. Security
```dockerfile
# Run as non-root user
RUN adduser --disabled-password appuser
USER appuser

# Scan for vulnerabilities
# docker scan myapp:latest

# Use specific versions (not :latest)
FROM node:20.11.0-alpine
```

### 4. Health Checks
```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:8080/health || exit 1
```

## Best Practices

- [ ] Use multi-stage builds
- [ ] Run as non-root user
- [ ] Add .dockerignore file
- [ ] Use specific base image versions
- [ ] Minimize number of layers
- [ ] Add health checks
- [ ] Set resource limits
- [ ] Scan for vulnerabilities
- [ ] Use layer caching effectively
- [ ] Keep images small (< 500 MB if possible)
