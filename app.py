import os
import sys
import subprocess

print("[HuggingFace Space] Initializing Kansai Downloader System...", flush=True)

# Install npm dependencies if not present
if not os.path.exists("node_modules"):
    print("[HuggingFace Space] Installing Node.js dependencies...", flush=True)
    subprocess.run(["npm", "install", "--production"], check=True)

# Hugging Face Spaces standard internal port is 7860
os.environ["PORT"] = "7860"

print("[HuggingFace Space] Launching Node.js backend server.js on port 7860...", flush=True)

# Run server.js and pass output directly to container logs
proc = subprocess.Popen([sys.executable, "-c", "import sys; print('Python ready')"])
proc.wait()

node_proc = subprocess.Popen(["node", "server.js"])
node_proc.wait()
