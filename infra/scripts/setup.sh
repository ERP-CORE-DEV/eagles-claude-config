#!/bin/bash
# =============================================================================
# EAGLES AI Platform - Azure Setup Script
# S5 SMART-SCALE | Central US | A100 Spot ($0.767/hr)
# =============================================================================
set -euo pipefail

# ---- Configuration ----
RESOURCE_GROUP="rg-eagles-ai-inference"
LOCATION="centralus"
AKS_CLUSTER="aks-eagles-inference"
ACR_NAME="acreaglesinference"
GPU_NODE_POOL="gpuspot"
NAMESPACE="ai-inference"
VLLM_VERSION="v0.15.1"

echo "=== Phase 1: Resource Group + ACR ==="
az group create --name $RESOURCE_GROUP --location $LOCATION
az acr create --resource-group $RESOURCE_GROUP --name $ACR_NAME --sku Basic --location $LOCATION

echo "=== Phase 1.1: Check GPU Quota ==="
echo "NOTE: GPU quota is 0 by default. Request increase via Azure Portal if needed."
echo "Portal -> Quotas -> Request increase -> NC A100 v4 family -> Central US -> 24 vCPUs"
az quota show --scope "/subscriptions/$(az account show --query id -o tsv)/providers/Microsoft.Compute/locations/$LOCATION" \
  --resource-name standardNCadsA100v4Family 2>/dev/null || echo "Quota check requires az quota extension. Install: az extension add --name quota"

echo "=== Phase 1.2: Create AKS Cluster ==="
az aks create \
  --resource-group $RESOURCE_GROUP \
  --name $AKS_CLUSTER \
  --location $LOCATION \
  --node-count 1 \
  --node-vm-size Standard_D2s_v3 \
  --enable-managed-identity \
  --generate-ssh-keys

echo "=== Phase 1.3: Add GPU Spot Node Pool ==="
az aks nodepool add \
  --resource-group $RESOURCE_GROUP \
  --cluster-name $AKS_CLUSTER \
  --name $GPU_NODE_POOL \
  --node-count 0 \
  --node-vm-size Standard_NC24ads_A100_v4 \
  --priority Spot \
  --eviction-policy Delete \
  --spot-max-price -1 \
  --node-taints sku=gpu:NoSchedule \
  --enable-cluster-autoscaler \
  --min-count 0 \
  --max-count 2 \
  --scale-down-mode Deallocate \
  --labels workload=ai-inference \
  --no-wait

echo "=== Phase 1.4: Get Credentials ==="
az aks get-credentials --resource-group $RESOURCE_GROUP --name $AKS_CLUSTER --overwrite-existing

echo "=== Phase 1.5: Install NVIDIA Device Plugin ==="
# AKS may auto-install this. Check first:
if ! kubectl get daemonset -n kube-system 2>/dev/null | grep -q nvidia; then
  kubectl apply -f https://raw.githubusercontent.com/NVIDIA/k8s-device-plugin/v0.18.0/deployments/static/nvidia-device-plugin.yml
  echo "NVIDIA device plugin installed"
else
  echo "NVIDIA device plugin already present"
fi

echo "=== Phase 1.6: Enable KEDA ==="
az aks update --resource-group $RESOURCE_GROUP --name $AKS_CLUSTER --enable-keda

echo "=== Phase 2: Build + Push vLLM Image ==="
az acr login --name $ACR_NAME
az acr build --registry $ACR_NAME --image vllm-openai:$VLLM_VERSION --file infra/docker/Dockerfile.vllm infra/docker/

echo "=== Phase 3: Deploy K8s Resources ==="
kubectl apply -f infra/k8s/ai-inference/namespace.yaml
kubectl apply -f infra/k8s/ai-inference/model-pvc.yaml
kubectl apply -f infra/k8s/ai-inference/litellm-config.yaml

echo ""
echo "=== MANUAL STEPS REQUIRED ==="
echo "1. Create secrets:"
echo "   kubectl create secret generic litellm-secrets \\"
echo "     --namespace ai-inference \\"
echo "     --from-literal=anthropic-api-key=sk-ant-XXXXX \\"
echo "     --from-literal=master-key=sk-eagles-XXXXX"
echo ""
echo "2. Deploy services:"
echo "   kubectl apply -f infra/k8s/ai-inference/vllm-deployment.yaml"
echo "   kubectl apply -f infra/k8s/ai-inference/vllm-service.yaml"
echo "   kubectl apply -f infra/k8s/ai-inference/litellm-deployment.yaml"
echo "   kubectl apply -f infra/k8s/ai-inference/gpu-monitoring.yaml"
echo "   kubectl apply -f infra/k8s/ai-inference/image-prepuller.yaml"
echo ""
echo "3. Install KEDA HTTP Add-On:"
echo "   helm repo add kedahttp https://kedacore.github.io/charts"
echo "   helm install keda-http-add-on kedahttp/keda-add-ons-http \\"
echo "     --namespace keda \\"
echo "     --set interceptor.responseHeaderTimeout=900 \\"
echo "     --set interceptor.waitTimeout=900"
echo ""
echo "4. Apply KEDA scaling:"
echo "   kubectl apply -f infra/k8s/ai-inference/keda-http-scaled-object.yaml"
echo ""
echo "5. Configure Claude Code (each developer):"
echo "   export ANTHROPIC_BASE_URL=http://<litellm-internal-lb-ip>:4000"
echo "   export ANTHROPIC_AUTH_TOKEN=<litellm-master-key>"
echo ""
echo "=== Setup complete (automated phases). Follow manual steps above. ==="
