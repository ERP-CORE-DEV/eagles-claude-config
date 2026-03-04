"""Start LiteLLM proxy with env vars loaded from .env file."""
import json
import os
import subprocess
import sys
import threading
import time
import urllib.request


def warmup_kimi():
    """Send a warm-up request to Kimi K2 Thinking in background."""
    print("Warming up Kimi K2 Thinking (background, ~60-180s)...")
    body = json.dumps({
        "model": "claude-opus-4-6",
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 5,
    }).encode()
    req = urllib.request.Request(
        "http://localhost:4000/v1/chat/completions",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    try:
        resp = urllib.request.urlopen(req, timeout=300)
        data = json.loads(resp.read())
        model = data.get("model", "unknown")
        print(f"  Kimi warm-up DONE -> responded as: {model}")
    except Exception as ex:
        print(f"  Kimi warm-up failed: {ex}")


def load_env(env_file):
    """Load .env file into a dict merged with os.environ."""
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    if not os.path.exists(env_file):
        print(f"WARNING: .env file not found at {env_file}")
        return env
    with open(env_file, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            key, _, value = line.partition("=")
            env[key.strip()] = value.strip()
    return env


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    env_file = os.path.join(script_dir, ".env")
    env = load_env(env_file)

    print("=== EAGLES AI Platform - LiteLLM Proxy ===")
    print(f"Primary: Kimi K2 Thinking -> {env.get('AZURE_AI_API_BASE', 'NOT SET')[:60]}")
    print(f"Codestral: {env.get('CODESTRAL_API_BASE', 'NOT SET')[:60]}")
    print(f"DeepSeek-R1: {env.get('DEEPSEEK_R1_API_BASE', 'NOT SET')[:60]}")
    print(f"DeepSeek-V3: {env.get('DEEPSEEK_V3_API_BASE', 'NOT SET')[:60]}")
    print()

    config = os.path.join(script_dir, "litellm-config.yaml")
    log_path = os.path.join(script_dir, "litellm.log")

    litellm_exe = os.path.join(os.path.dirname(sys.executable), "Scripts", "litellm.exe")
    if not os.path.exists(litellm_exe):
        litellm_exe = "litellm"

    log_file = open(log_path, "w", encoding="utf-8", errors="replace")
    proc = subprocess.Popen(
        [litellm_exe, "--config", config, "--port", "4000"],
        env=env,
        stdout=log_file,
        stderr=subprocess.STDOUT,
    )
    print(f"LiteLLM started (PID {proc.pid}), log: {log_path}")
    print("Waiting 15s for startup...")
    time.sleep(15)

    # Check if process crashed during startup
    if proc.poll() is not None:
        log_file.close()
        print(f"ERROR: LiteLLM exited with code {proc.returncode}")
        print(f"Check logs: {log_path}")
        return

    # Quick proxy health check (just verify proxy is responding)
    req = urllib.request.Request("http://localhost:4000/v1/models")
    try:
        resp = urllib.request.urlopen(req, timeout=5)
        data = json.loads(resp.read())
        models = [m["id"] for m in data.get("data", [])]
        print(f"\nProxy ready at http://localhost:4000")
        print(f"Models: {', '.join(models)}")
        print(f"Use: ANTHROPIC_BASE_URL=http://localhost:4000")
    except Exception as ex:
        print(f"Proxy check failed: {ex}")
        print(f"Check logs: {log_path}")
        return

    # Warm up Kimi in background (prevents cold start for first real request)
    warmup_thread = threading.Thread(target=warmup_kimi, daemon=True)
    warmup_thread.start()

    print("\nKimi warm-up running in background. You can start Claude Code now.")
    print("First response may be slow if warm-up hasn't finished yet.")

    # Wait for warm-up to complete (user can Ctrl+C to exit)
    try:
        warmup_thread.join(timeout=300)
        print("\nProxy is running. Press Ctrl+C to stop.")
        proc.wait()
    except KeyboardInterrupt:
        print("\nShutting down LiteLLM proxy...")
        proc.terminate()
        proc.wait(timeout=10)
        print("Proxy stopped.")
    finally:
        log_file.close()


if __name__ == "__main__":
    main()
