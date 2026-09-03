import os
import sys
import subprocess

# ZeroGPU compatibility handler
try:
    import spaces
    @spaces.GPU
    def _zero_gpu_ready():
        return True
    try:
        _zero_gpu_ready()
    except Exception:
        pass
except Exception:
    pass

print("[HuggingFace Space] Initializing Kansai Downloader System...", flush=True)

# Install npm dependencies if not present
if not os.path.exists("node_modules"):
    print("[HuggingFace Space] Installing Node.js dependencies...", flush=True)
    subprocess.run(["npm", "install", "--production"], check=True)

# Hugging Face Spaces standard internal port is 7860
os.environ["PORT"] = "7860"

print("[HuggingFace Space] Launching Node.js backend server.js on port 7860...", flush=True)

node_proc = subprocess.Popen(["node", "server.js"])
node_proc.wait()
