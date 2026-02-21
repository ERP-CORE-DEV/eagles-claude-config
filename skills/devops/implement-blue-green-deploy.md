---
name: implement-blue-green-deploy
description: Implement blue-green deployment for zero-downtime releases
---

# Blue-Green Deployment Implementation Guide

Zero-downtime deployment strategy using parallel environments with instant traffic switching and safe rollback.

## Core Concept

Blue-green deployment maintains two identical production environments. At any time, only one (say "blue") serves live traffic. New releases deploy to the idle environment ("green"), get verified, and traffic is switched atomically. The old environment becomes the next deployment target.

---

## 1. Kubernetes Blue-Green with Service Selector Switching

### Deployment Manifests

Create two identical Deployments, differentiated by a `slot` label:

```yaml
# blue-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-blue
  labels:
    app: myapp
    slot: blue
spec:
  replicas: 3
  selector:
    matchLabels:
      app: myapp
      slot: blue
  template:
    metadata:
      labels:
        app: myapp
        slot: blue
        version: "2.1.0"
    spec:
      containers:
        - name: myapp
          image: acr.azurecr.io/myapp:2.1.0
          ports:
            - containerPort: 8080
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 5
            failureThreshold: 3
          livenessProbe:
            httpGet:
              path: /health/live
              port: 8080
            initialDelaySeconds: 15
            periodSeconds: 10
          resources:
            requests:
              cpu: 250m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
```

```yaml
# green-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-green
  labels:
    app: myapp
    slot: green
spec:
  replicas: 3
  selector:
    matchLabels:
      app: myapp
      slot: green
  template:
    metadata:
      labels:
        app: myapp
        slot: green
        version: "2.2.0"
    spec:
      containers:
        - name: myapp
          image: acr.azurecr.io/myapp:2.2.0
          ports:
            - containerPort: 8080
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 5
            failureThreshold: 3
          livenessProbe:
            httpGet:
              path: /health/live
              port: 8080
            initialDelaySeconds: 15
            periodSeconds: 10
          resources:
            requests:
              cpu: 250m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
```

### Service Selector Switching

The Service routes traffic based on its `selector`. Switching is a single `kubectl patch`:

```yaml
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp
spec:
  type: ClusterIP
  selector:
    app: myapp
    slot: blue          # <-- change to "green" to switch
  ports:
    - port: 80
      targetPort: 8080
```

Switch traffic from blue to green:

```bash
kubectl patch service myapp -p '{"spec":{"selector":{"slot":"green"}}}'
```

Rollback to blue:

```bash
kubectl patch service myapp -p '{"spec":{"selector":{"slot":"blue"}}}'
```

### Automated Cutover Script (Kubernetes)

```bash
#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="myapp"
NAMESPACE="production"
NEW_SLOT="$1"  # "blue" or "green"
HEALTH_ENDPOINT="/health/ready"
MAX_RETRIES=30
RETRY_INTERVAL=5

echo "=== Blue-Green Cutover: switching to $NEW_SLOT ==="

# Step 1: Verify all pods in the target slot are Ready
echo "Verifying target deployment readiness..."
READY_PODS=$(kubectl get pods -n "$NAMESPACE" \
  -l "app=$SERVICE_NAME,slot=$NEW_SLOT" \
  -o jsonpath='{.items[*].status.conditions[?(@.type=="Ready")].status}' \
  | tr ' ' '\n' | grep -c "True")

DESIRED_PODS=$(kubectl get deployment "myapp-$NEW_SLOT" -n "$NAMESPACE" \
  -o jsonpath='{.spec.replicas}')

if [ "$READY_PODS" -lt "$DESIRED_PODS" ]; then
  echo "ERROR: Only $READY_PODS/$DESIRED_PODS pods ready. Aborting."
  exit 1
fi

# Step 2: Run smoke tests against the idle slot
echo "Running pre-cutover health checks..."
kubectl expose deployment "myapp-$NEW_SLOT" -n "$NAMESPACE" \
  --name="myapp-$NEW_SLOT-test" --port=80 --target-port=8080 \
  --type=ClusterIP --dry-run=client -o yaml | kubectl apply -f -

for i in $(seq 1 "$MAX_RETRIES"); do
  STATUS=$(kubectl exec -n "$NAMESPACE" deploy/curl-pod -- \
    curl -s -o /dev/null -w "%{http_code}" \
    "http://myapp-$NEW_SLOT-test$HEALTH_ENDPOINT" 2>/dev/null || echo "000")
  if [ "$STATUS" = "200" ]; then
    echo "Health check passed (attempt $i/$MAX_RETRIES)"
    break
  fi
  if [ "$i" -eq "$MAX_RETRIES" ]; then
    echo "ERROR: Health check failed after $MAX_RETRIES attempts."
    kubectl delete service "myapp-$NEW_SLOT-test" -n "$NAMESPACE" --ignore-not-found
    exit 1
  fi
  sleep "$RETRY_INTERVAL"
done

# Step 3: Perform the atomic selector switch
echo "Switching traffic to $NEW_SLOT..."
kubectl patch service "$SERVICE_NAME" -n "$NAMESPACE" \
  -p "{\"spec\":{\"selector\":{\"slot\":\"$NEW_SLOT\"}}}"

# Step 4: Cleanup temporary test service
kubectl delete service "myapp-$NEW_SLOT-test" -n "$NAMESPACE" --ignore-not-found

echo "=== Cutover complete. Live slot: $NEW_SLOT ==="
```

---

## 2. Azure App Service Deployment Slots

Azure App Service provides built-in blue-green via deployment slots.

### Setup with Azure CLI

```bash
# Create the staging slot (green)
az webapp deployment slot create \
  --name myapp-prod \
  --resource-group rg-production \
  --slot staging

# Deploy new version to staging slot
az webapp deployment source config-zip \
  --name myapp-prod \
  --resource-group rg-production \
  --slot staging \
  --src artifact.zip

# Verify staging slot health
curl -f https://myapp-prod-staging.azurewebsites.net/health/ready

# Swap staging into production (zero-downtime)
az webapp deployment slot swap \
  --name myapp-prod \
  --resource-group rg-production \
  --slot staging \
  --target-slot production

# Rollback: swap again
az webapp deployment slot swap \
  --name myapp-prod \
  --resource-group rg-production \
  --slot staging \
  --target-slot production
```

### Slot-Sticky Settings

Certain settings should stay with the slot, not travel with the swap:

```bash
az webapp config appsettings set \
  --name myapp-prod \
  --resource-group rg-production \
  --slot staging \
  --slot-settings SLOT_NAME=staging FEATURE_FLAG_NEW_UI=true
```

### Warm-Up Configuration

Ensure the new slot is warm before swap:

```xml
<system.webServer>
  <applicationInitialization>
    <add initializationPage="/health/ready" />
    <add initializationPage="/api/warmup" />
  </applicationInitialization>
</system.webServer>
```

---

## 3. AWS CodeDeploy Blue-Green

### appspec.yml

```yaml
version: 0.0
os: linux
files:
  - source: /
    destination: /opt/myapp
hooks:
  BeforeInstall:
    - location: scripts/stop_server.sh
      timeout: 60
  AfterInstall:
    - location: scripts/configure.sh
      timeout: 120
  ApplicationStart:
    - location: scripts/start_server.sh
      timeout: 60
  ValidateService:
    - location: scripts/health_check.sh
      timeout: 120
```

### CodeDeploy Deployment Group (CloudFormation)

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Resources:
  BlueGreenDeploymentGroup:
    Type: AWS::CodeDeploy::DeploymentGroup
    Properties:
      ApplicationName: !Ref CodeDeployApp
      DeploymentGroupName: myapp-blue-green
      ServiceRoleArn: !GetAtt CodeDeployRole.Arn
      DeploymentStyle:
        DeploymentType: BLUE_GREEN
        DeploymentOption: WITH_TRAFFIC_CONTROL
      BlueGreenDeploymentConfiguration:
        TerminateBlueInstancesOnDeploymentSuccess:
          Action: KEEP_ALIVE
          TerminationWaitTimeInMinutes: 60
        DeploymentReadyOption:
          ActionOnTimeout: CONTINUE_DEPLOYMENT
          WaitTimeInMinutes: 5
        GreenFleetProvisioningOption:
          Action: COPY_AUTO_SCALING_GROUP
      AutoScalingGroups:
        - !Ref BlueAutoScalingGroup
      LoadBalancerInfo:
        TargetGroupInfoList:
          - Name: !GetAtt ProdTargetGroup.TargetGroupName
```

### Validation Script (health_check.sh)

```bash
#!/usr/bin/env bash
set -euo pipefail

MAX_RETRIES=20
RETRY_INTERVAL=3
HEALTH_URL="http://localhost:8080/health/ready"

for i in $(seq 1 $MAX_RETRIES); do
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" || echo "000")
  if [ "$HTTP_STATUS" = "200" ]; then
    echo "Application healthy after $i checks."
    exit 0
  fi
  echo "Attempt $i/$MAX_RETRIES: status=$HTTP_STATUS, retrying..."
  sleep $RETRY_INTERVAL
done

echo "ERROR: Application failed health checks."
exit 1
```

---

## 4. Nginx Upstream Switching

For self-hosted or VM-based deployments, Nginx switches traffic between upstream groups.

### Nginx Configuration

```nginx
# /etc/nginx/conf.d/blue-green.conf

upstream blue {
    server 10.0.1.10:8080;
    server 10.0.1.11:8080;
    server 10.0.1.12:8080;
}

upstream green {
    server 10.0.2.10:8080;
    server 10.0.2.11:8080;
    server 10.0.2.12:8080;
}

# Symlink: active-slot.conf -> blue.conf or green.conf
# blue.conf contains:  set $active_upstream blue;
# green.conf contains: set $active_upstream green;
include /etc/nginx/conf.d/active-slot.conf;

server {
    listen 80;
    server_name myapp.example.com;

    location / {
        proxy_pass http://$active_upstream;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
    }

    location /health {
        access_log off;
        proxy_pass http://$active_upstream/health/ready;
    }
}
```

### Switching Script

```bash
#!/usr/bin/env bash
set -euo pipefail

TARGET_SLOT="$1"  # "blue" or "green"
NGINX_CONF_DIR="/etc/nginx/conf.d"
LINK_PATH="$NGINX_CONF_DIR/active-slot.conf"

if [[ "$TARGET_SLOT" != "blue" && "$TARGET_SLOT" != "green" ]]; then
  echo "Usage: $0 [blue|green]"; exit 1
fi

# Health-check target upstream before switching
for SERVER in $(grep -A3 "upstream $TARGET_SLOT" \
  "$NGINX_CONF_DIR/blue-green.conf" | grep 'server ' \
  | awk '{print $2}' | tr -d ';'); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    "http://$SERVER/health/ready" || echo "000")
  if [ "$STATUS" != "200" ]; then
    echo "ERROR: $SERVER unhealthy (HTTP $STATUS). Aborting."
    exit 1
  fi
done

ln -sf "$NGINX_CONF_DIR/${TARGET_SLOT}.conf" "$LINK_PATH"
nginx -t && nginx -s reload
echo "Traffic switched to $TARGET_SLOT."
```

---

## 5. Health Verification Before Cutover

Every blue-green strategy must include pre-cutover health verification covering multiple layers:

```
1. Liveness   - Process is running and accepting connections
2. Readiness  - Dependencies (DB, cache, queues) are connected
3. Smoke test - Critical business endpoints return expected data
4. Load test  - New environment handles expected traffic volume
```

### Multi-Layer Health Check

```bash
#!/usr/bin/env bash
set -euo pipefail

TARGET_URL="$1"

echo "--- Layer 1: Liveness ---"
curl -sf "$TARGET_URL/health/live" > /dev/null \
  || { echo "FAIL: Liveness"; exit 1; }

echo "--- Layer 2: Readiness ---"
curl -sf "$TARGET_URL/health/ready" > /dev/null \
  || { echo "FAIL: Readiness"; exit 1; }

echo "--- Layer 3: Smoke Tests ---"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$TARGET_URL/api/v1/status")
[ "$STATUS" = "200" ] \
  || { echo "FAIL: Smoke /api/v1/status returned $STATUS"; exit 1; }

echo "--- Layer 4: Response Time ---"
RESPONSE_TIME=$(curl -s -o /dev/null -w "%{time_total}" \
  "$TARGET_URL/api/v1/status")
THRESHOLD="2.0"
if (( $(echo "$RESPONSE_TIME > $THRESHOLD" | bc -l) )); then
  echo "FAIL: ${RESPONSE_TIME}s exceeds ${THRESHOLD}s threshold"
  exit 1
fi

echo "All health checks passed. Safe to cutover."
```

---

## 6. Rollback Procedures

### Immediate Rollback (All Platforms)

| Platform           | Rollback Command                                                         | Time     |
|--------------------|--------------------------------------------------------------------------|----------|
| Kubernetes         | `kubectl patch svc myapp -p '{"spec":{"selector":{"slot":"blue"}}}'`     | < 1s     |
| Azure App Service  | `az webapp deployment slot swap --slot staging --target-slot production`  | 30-60s   |
| AWS CodeDeploy     | `aws deploy stop-deployment --deployment-id <id> --auto-rollback-enabled`| 1-2 min  |
| Nginx              | `ln -sf blue.conf active-slot.conf && nginx -s reload`                   | < 1s     |

### Automated Rollback Trigger

Monitor error rates post-cutover and auto-rollback if thresholds are breached:

```bash
#!/usr/bin/env bash
set -euo pipefail

MONITORING_DURATION=300  # 5 minutes
CHECK_INTERVAL=10
ERROR_THRESHOLD=5        # percentage
PREVIOUS_SLOT="$1"

START_TIME=$(date +%s)
while true; do
  ELAPSED=$(( $(date +%s) - START_TIME ))
  [ "$ELAPSED" -ge "$MONITORING_DURATION" ] && {
    echo "Deployment stable."; exit 0; }

  ERROR_RATE=$(curl -s \
    "http://prometheus:9090/api/v1/query?query=rate(http_requests_total{status=~'5..'}[1m])/rate(http_requests_total[1m])*100" \
    | jq -r '.data.result[0].value[1] // "0"')

  if (( $(echo "$ERROR_RATE > $ERROR_THRESHOLD" | bc -l) )); then
    echo "ERROR ${ERROR_RATE}% > ${ERROR_THRESHOLD}%. Rolling back..."
    kubectl patch service myapp \
      -p "{\"spec\":{\"selector\":{\"slot\":\"$PREVIOUS_SLOT\"}}}"
    exit 1
  fi
  sleep "$CHECK_INTERVAL"
done
```

---

## 7. Database Migration Strategies with Blue-Green

Database changes are the hardest part of blue-green deployments. The old environment must remain functional during and after cutover for rollback safety.

### Expand-Contract (Parallel Change) Pattern

Database changes happen in two phases:

```
Phase 1 - EXPAND (before deployment):
  - Add new columns/tables (nullable or with defaults)
  - Create new indexes
  - Both blue and green can read/write safely

Phase 2 - CONTRACT (after verified stable):
  - Remove deprecated columns/tables
  - Tighten constraints (NOT NULL, etc.)
  - Only run after rollback window has closed
```

### Migration Execution Order

```
1. Run EXPAND migrations against the shared database
2. Deploy new code to the idle (green) environment
3. Verify green works with the expanded schema
4. Switch traffic to green
5. Monitor for rollback window (e.g., 1 hour)
6. If stable: run CONTRACT migrations
7. If rollback needed: switch back to blue (safe - schema only expanded)
```

### Example: Renaming a Column

```sql
-- Phase 1: EXPAND (safe for both old and new code)
ALTER TABLE candidates ADD COLUMN full_name VARCHAR(255);
UPDATE candidates SET full_name = name WHERE full_name IS NULL;
CREATE TRIGGER sync_name_columns
  BEFORE INSERT OR UPDATE ON candidates
  FOR EACH ROW EXECUTE FUNCTION sync_name_to_full_name();

-- Phase 2: CONTRACT (after rollback window closes)
ALTER TABLE candidates DROP COLUMN name;
DROP TRIGGER sync_name_columns ON candidates;
```

### CosmosDB Considerations

For document databases like CosmosDB, expand-contract is simpler:

```csharp
// V2 read: falls back to old field name
public string GetDisplayName(CandidateDocument doc)
{
    return doc.FullName ?? doc.Name;
}

// V2 write: populate both fields during transition
public void UpdateCandidate(CandidateDocument doc, string newName)
{
    doc.FullName = newName;
    doc.Name = newName;  // backward compatibility
}
```

---

## 8. Canary Variant of Blue-Green

A canary deployment sends a small percentage of traffic to the new environment before full cutover, combining blue-green safety with gradual rollout.

### Kubernetes Canary with Ingress Annotations

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp-canary
  annotations:
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-weight: "10"
spec:
  ingressClassName: nginx
  rules:
    - host: myapp.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: myapp-green
                port:
                  number: 80
```

### Progressive Canary Promotion

```bash
#!/usr/bin/env bash
set -euo pipefail

CANARY_STEPS=(5 10 25 50 100)
SOAK_TIME=120
ERROR_THRESHOLD=2

for WEIGHT in "${CANARY_STEPS[@]}"; do
  echo "Canary weight: ${WEIGHT}%"
  kubectl annotate ingress myapp-canary \
    nginx.ingress.kubernetes.io/canary-weight="$WEIGHT" --overwrite

  if [ "$WEIGHT" -eq 100 ]; then
    kubectl patch service myapp -p '{"spec":{"selector":{"slot":"green"}}}'
    kubectl delete ingress myapp-canary --ignore-not-found
    break
  fi

  sleep "$SOAK_TIME"

  ERROR_RATE=$(curl -s \
    "http://prometheus:9090/api/v1/query?query=rate(http_requests_total{slot='green',status=~'5..'}[2m])/rate(http_requests_total{slot='green'}[2m])*100" \
    | jq -r '.data.result[0].value[1] // "0"')

  if (( $(echo "$ERROR_RATE > $ERROR_THRESHOLD" | bc -l) )); then
    echo "Error rate ${ERROR_RATE}% at ${WEIGHT}%. Rolling back."
    kubectl annotate ingress myapp-canary \
      nginx.ingress.kubernetes.io/canary-weight="0" --overwrite
    exit 1
  fi
done
echo "Canary promotion complete."
```

---

## Quick Reference: Decision Matrix

| Scenario                            | Recommended Approach       |
|-------------------------------------|----------------------------|
| Kubernetes workloads                | Service selector switching |
| Azure PaaS (App Service)           | Deployment slots           |
| AWS EC2 / Auto Scaling             | CodeDeploy blue-green      |
| Self-hosted / VM-based             | Nginx upstream switching   |
| High-risk releases                 | Canary variant             |
| Schema-breaking DB changes         | Expand-contract migration  |
| Stateless APIs                     | Direct blue-green swap     |
| Long-running background jobs       | Drain + swap               |
