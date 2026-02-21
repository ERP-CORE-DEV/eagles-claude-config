---
name: deploy-to-azure
description: Deploy application to Azure (App Service, AKS, Functions, Container Apps)
argument-hint: [service: appservice|aks|functions|containerapp] [iac: bicep|arm|terraform]
tags: [cloud, Azure, deployment, AKS, App-Service, Bicep, Functions]
---

# Azure Deployment Guide

---

## Azure Container Apps (Recommended for Containers)

```bash
az containerapp create \
  --name myapp \
  --resource-group rg-prod \
  --environment myenv \
  --image myacr.azurecr.io/myapp:latest \
  --target-port 8080 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 10 \
  --secrets "db-conn=secretref:db-connection-string" \
  --env-vars "ASPNETCORE_ENVIRONMENT=Production" "ConnectionString=secretref:db-conn"
```

---

## AKS (Kubernetes)

```bash
az aks get-credentials --resource-group rg-prod --name aks-prod
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```

### Helm Chart

```yaml
# values.yaml
replicaCount: 3
image:
  repository: myacr.azurecr.io/myapp
  tag: latest
service:
  type: ClusterIP
  port: 80
resources:
  limits: { cpu: 500m, memory: 512Mi }
  requests: { cpu: 250m, memory: 256Mi }
```

```bash
helm upgrade --install myapp ./charts/myapp -f values.yaml -n production
```

---

## App Service

```bash
az webapp create --name myapp --resource-group rg-prod --plan myplan --runtime "DOTNETCORE:8.0"
az webapp deployment source config-zip --name myapp --resource-group rg-prod --src app.zip
```

---

## Azure Functions

```bash
func azure functionapp publish myapp-func
```

---

## Bicep (Infrastructure as Code)

```bicep
resource containerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'myapp'
  location: resourceGroup().location
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      ingress: { external: true, targetPort: 8080 }
      secrets: [{ name: 'db-conn', value: dbConnectionString }]
    }
    template: {
      containers: [{
        name: 'api'
        image: '${acr.properties.loginServer}/myapp:latest'
        resources: { cpu: json('0.5'), memory: '1Gi' }
      }]
      scale: { minReplicas: 1, maxReplicas: 10 }
    }
  }
}
```

---

## CI/CD (Azure DevOps)

```yaml
trigger:
  branches: { include: [main] }
pool:
  vmImage: ubuntu-latest
steps:
  - task: Docker@2
    inputs:
      containerRegistry: myacr
      repository: myapp
      command: buildAndPush
      tags: $(Build.BuildId)
  - task: AzureWebAppContainer@1
    inputs:
      appName: myapp
      imageName: myacr.azurecr.io/myapp:$(Build.BuildId)
```
