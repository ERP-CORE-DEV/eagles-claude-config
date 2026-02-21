---
name: deploy-to-aws
description: Deploy application to AWS (ECS, Lambda, EC2, CloudFormation)
argument-hint: [service: ecs|lambda|ec2|eks] [iac: cloudformation|cdk|terraform]
tags: [cloud, AWS, deployment, ECS, Lambda, CloudFormation, CDK]
---

# AWS Deployment Guide

---

## ECS Fargate (Containers)

### Task Definition

```json
{
  "family": "myapp",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "containerDefinitions": [{
    "name": "api",
    "image": "123456789.dkr.ecr.eu-west-1.amazonaws.com/myapp:latest",
    "portMappings": [{ "containerPort": 8080 }],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/myapp",
        "awslogs-region": "eu-west-1",
        "awslogs-stream-prefix": "api"
      }
    },
    "environment": [
      { "name": "ASPNETCORE_ENVIRONMENT", "value": "Production" }
    ],
    "secrets": [
      { "name": "ConnectionString", "valueFrom": "arn:aws:secretsmanager:eu-west-1:123:secret:db-conn" }
    ]
  }]
}
```

### Deploy with CLI

```bash
# Build and push
aws ecr get-login-password | docker login --username AWS --password-stdin 123456789.dkr.ecr.eu-west-1.amazonaws.com
docker build -t myapp .
docker tag myapp:latest 123456789.dkr.ecr.eu-west-1.amazonaws.com/myapp:latest
docker push 123456789.dkr.ecr.eu-west-1.amazonaws.com/myapp:latest

# Update service
aws ecs update-service --cluster prod --service myapp --force-new-deployment
```

---

## Lambda (Serverless)

### .NET 8 Minimal API

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddAWSLambdaHosting(LambdaEventSource.HttpApi);
var app = builder.Build();
app.MapGet("/api/status", () => new { status = "ok" });
app.Run();
```

### SAM Template

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Resources:
  ApiFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: bootstrap
      Runtime: dotnet8
      MemorySize: 256
      Timeout: 30
      Events:
        Api:
          Type: HttpApi
```

```bash
sam build && sam deploy --guided
```

---

## CDK (Infrastructure as Code)

```typescript
import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';

const cluster = new ecs.Cluster(this, 'Cluster', { vpc });
const service = new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'Service', {
  cluster,
  taskImageOptions: { image: ecs.ContainerImage.fromEcrRepository(repo) },
  desiredCount: 2,
  cpu: 256,
  memoryLimitMiB: 512,
});
service.targetGroup.configureHealthCheck({ path: '/health' });
```

---

## CI/CD (GitHub Actions)

```yaml
- name: Configure AWS
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::123:role/deploy
    aws-region: eu-west-1
- name: Deploy
  run: |
    aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REGISTRY
    docker build -t $ECR_REGISTRY/myapp:${{ github.sha }} .
    docker push $ECR_REGISTRY/myapp:${{ github.sha }}
    aws ecs update-service --cluster prod --service myapp --force-new-deployment
```
