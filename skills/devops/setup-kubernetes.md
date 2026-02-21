---
name: setup-kubernetes
description: Setup Kubernetes deployment with Helm charts, HPA, probes, and namespace strategy
argument-hint: [provider: aks|eks|gke|k3s] [tool: helm|kustomize|kubectl]
tags: [devops, kubernetes, k8s, AKS, Helm, deployment, HPA, probes]
---

# Kubernetes Setup Guide

Kubernetes orchestrates containerized microservices with auto-scaling, self-healing, and rolling updates.

---

## 1. Helm Chart Structure

```
charts/{service-name}/
  Chart.yaml
  values.yaml
  values-dev.yaml
  values-staging.yaml
  values-prod.yaml
  templates/
    deployment.yaml
    service.yaml
    hpa.yaml
    ingress.yaml
    configmap.yaml
    secret.yaml
    _helpers.tpl
```

### Chart.yaml

```yaml
apiVersion: v2
name: matching-engine
description: Candidate Matching Engine microservice
version: 0.1.0
appVersion: "1.0.0"
dependencies:
  - name: common
    version: "1.x.x"
    repository: "https://charts.bitnami.com/bitnami"
```

### values.yaml (Default)

```yaml
replicaCount: 2
image:
  repository: acrsourcingcandidate.azurecr.io/matching-engine
  tag: "latest"
  pullPolicy: IfNotPresent
imagePullSecrets:
  - name: acr-secret

service:
  type: ClusterIP
  port: 80
  targetPort: 8080

resources:
  requests:
    cpu: 250m
    memory: 256Mi
  limits:
    cpu: 500m
    memory: 512Mi

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80

probes:
  liveness:
    path: /health/live
    initialDelaySeconds: 15
    periodSeconds: 10
  readiness:
    path: /health/ready
    initialDelaySeconds: 5
    periodSeconds: 5

env:
  ASPNETCORE_ENVIRONMENT: "Production"
  COSMOS_DB_NAME: "SourcingCandidateAttraction"

secrets:
  cosmosDbConnectionString: ""
  applicationInsightsKey: ""

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: api.rh-optimerp.com
      paths:
        - path: /api/matching
          pathType: Prefix
  tls:
    - secretName: api-tls
      hosts: [api.rh-optimerp.com]
```

### deployment.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "chart.fullname" . }}
  labels: {{- include "chart.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels: {{- include "chart.selectorLabels" . | nindent 6 }}
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1
  template:
    metadata:
      labels: {{- include "chart.selectorLabels" . | nindent 8 }}
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
    spec:
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          ports:
            - containerPort: {{ .Values.service.targetPort }}
          livenessProbe:
            httpGet:
              path: {{ .Values.probes.liveness.path }}
              port: {{ .Values.service.targetPort }}
            initialDelaySeconds: {{ .Values.probes.liveness.initialDelaySeconds }}
            periodSeconds: {{ .Values.probes.liveness.periodSeconds }}
          readinessProbe:
            httpGet:
              path: {{ .Values.probes.readiness.path }}
              port: {{ .Values.service.targetPort }}
            initialDelaySeconds: {{ .Values.probes.readiness.initialDelaySeconds }}
            periodSeconds: {{ .Values.probes.readiness.periodSeconds }}
          resources: {{- toYaml .Values.resources | nindent 12 }}
          envFrom:
            - configMapRef:
                name: {{ include "chart.fullname" . }}-config
            - secretRef:
                name: {{ include "chart.fullname" . }}-secrets
```

### hpa.yaml

```yaml
{{- if .Values.autoscaling.enabled }}
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {{ include "chart.fullname" . }}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: {{ include "chart.fullname" . }}
  minReplicas: {{ .Values.autoscaling.minReplicas }}
  maxReplicas: {{ .Values.autoscaling.maxReplicas }}
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: {{ .Values.autoscaling.targetCPUUtilizationPercentage }}
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: {{ .Values.autoscaling.targetMemoryUtilizationPercentage }}
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 25
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 30
      policies:
        - type: Percent
          value: 100
          periodSeconds: 30
{{- end }}
```

---

## 2. Namespace Strategy

```bash
kubectl create namespace matching-engine-dev
kubectl create namespace matching-engine-staging
kubectl create namespace matching-engine-prod

# Deploy to environment
helm upgrade --install matching-engine ./charts/matching-engine \
  -n matching-engine-prod \
  -f charts/matching-engine/values-prod.yaml \
  --set image.tag=$BUILD_TAG
```

---

## 3. AKS-Specific Setup

```bash
# Create cluster
az aks create \
  --resource-group rg-sourcing-and-candidate-attraction \
  --name aks-sourcing-candidate \
  --node-count 3 \
  --node-vm-size Standard_D4s_v3 \
  --enable-cluster-autoscaler \
  --min-count 2 --max-count 10 \
  --network-plugin azure \
  --enable-managed-identity \
  --attach-acr acrsourcingcandidate

# Get credentials
az aks get-credentials --resource-group rg-sourcing-and-candidate-attraction \
  --name aks-sourcing-candidate

# Install ingress controller
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install ingress-nginx ingress-nginx/ingress-nginx -n ingress --create-namespace
```

---

## 4. Resource Guidelines

| Service Type | CPU Request | CPU Limit | Memory Request | Memory Limit |
|-------------|------------|-----------|---------------|-------------|
| API (light) | 100m | 250m | 128Mi | 256Mi |
| API (heavy matching) | 250m | 1000m | 256Mi | 1Gi |
| Background worker | 500m | 2000m | 512Mi | 2Gi |
| Redis cache | 100m | 500m | 256Mi | 1Gi |

## Troubleshooting

```bash
# Pod not starting
kubectl describe pod <pod-name> -n <namespace>
kubectl logs <pod-name> -n <namespace> --previous

# Check events
kubectl get events -n <namespace> --sort-by='.lastTimestamp'

# Debug networking
kubectl run debug --rm -it --image=busybox -n <namespace> -- /bin/sh
wget -qO- http://matching-engine:80/health/live
```
