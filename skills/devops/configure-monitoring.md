---
name: configure-monitoring
description: Configure full-stack observability with Prometheus, Grafana, and AlertManager covering golden signals, SLI/SLO, and business metrics
version: "2.0"
tags: [devops, monitoring, prometheus, grafana, alertmanager, observability, sli, slo]
---

# devops/configure-monitoring

Production-grade monitoring stack: Prometheus metrics collection, Grafana dashboards, AlertManager routing, and application instrumentation for .NET, Node.js, and Python services.

## 1. Prometheus Server Configuration

### prometheus.yml -- Core Configuration

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  scrape_timeout: 10s
  external_labels:
    cluster: "production"
    environment: "prod"

rule_files:
  - "/etc/prometheus/rules/*.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets: ["alertmanager:9093"]
      timeout: 10s

scrape_configs:
  # Prometheus self-monitoring
  - job_name: "prometheus"
    static_configs:
      - targets: ["localhost:9090"]

  # .NET microservices (prometheus-net exposes on /metrics)
  - job_name: "dotnet-services"
    metrics_path: /metrics
    scrape_interval: 10s
    kubernetes_sd_configs:
      - role: pod
        namespaces:
          names: ["matching-engine", "training-service"]
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: "true"
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_port]
        action: replace
        target_label: __address__
        regex: (.+)
        replacement: "$${1}:$${2}"
      - source_labels: [__meta_kubernetes_namespace]
        target_label: namespace
      - source_labels: [__meta_kubernetes_pod_name]
        target_label: pod
      - source_labels: [__meta_kubernetes_pod_label_app]
        target_label: app

  # Node.js services (prom-client)
  - job_name: "nodejs-services"
    metrics_path: /metrics
    scrape_interval: 10s
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_label_runtime]
        action: keep
        regex: "nodejs"
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_port]
        action: replace
        target_label: __address__
        regex: (.+)
        replacement: "$${1}:$${2}"

  # Python services (prometheus_client)
  - job_name: "python-services"
    metrics_path: /metrics
    scrape_interval: 10s
    static_configs:
      - targets: ["python-ml-service:8000"]
        labels:
          service: "ml-scoring"

  # Infrastructure exporters
  - job_name: "node-exporter"
    kubernetes_sd_configs:
      - role: node
    relabel_configs:
      - action: replace
        target_label: __address__
        replacement: "$${1}:9100"
        source_labels: [__address__]
        regex: "(.+):\d+"
```
