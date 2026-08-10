# 🚀 Colab GPU — CaptchaMaster Setup

Local CPU te training slow, Colab GPU te **10-20x fast**. Ekhane shudhu 3-4 ta step.

---

## Step 1 — Notebook + GPU

1. [colab.research.google.com](https://colab.research.google.com) → **New Notebook**
2. Menu → **Runtime** → **Change runtime type**
3. **Hardware accelerator** → **GPU** → **Save**

## Step 2 — Clone + Install (1 cell e sob)

Cell e eta paste kore **Run** koren:

```python
!git clone https://github.com/mdrijonhossainjibon/CMM.git
%cd /content/CMM
!pip install -q ultralytics torch torchvision --index-url https://download.pytorch.org/whl/cu121
!pip install -q fastapi "uvicorn[standard]" python-multipart python-dotenv pydantic pydantic-settings "python-jose[cryptography]" "passlib[bcrypt]" opencv-python pillow numpy pi-heif watchfiles psutil motor pymongo google-auth boto3 websockets onnx onnxslim onnxruntime
import torch
print("GPU:", torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU ERROR — GPU select korun")
```

> Output e GPU name (Tesla T4) dekhte hobe.

## Step 3 — MongoDB (Atlas)

Colab e local MongoDB connect kora jay na — **Atlas** lagbe (free):

1. [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas) → free cluster
2. **Network Access** → **Add IP** → `0.0.0.0/0` → save
3. Connection string copy: `mongodb+srv://user:pass@cluster.mongodb.net`

Cell e set koren:

```python
import os
os.environ["MONGODB_URI"] = "mongodb+srv://USER:PASSWORD@cluster.mongodb.net/captchamaster"
os.environ["MONGODB_DB_NAME"] = "captchamaster"
```

## Step 4 — Training Data

### Option A: R2 theke (R2 configure kora thakle) — easiest

R2 er Access Key gulo apnar Settings page theke niben.

```python
!pip install -q boto3
import os, boto3
from botocore.config import Config

s3 = boto3.client("s3",
    endpoint_url="https://<account-id>.r2.cloudflarestorage.com",
    aws_access_key_id="<ACCESS_KEY>",
    aws_secret_access_key="<SECRET_KEY>",
    config=Config(region_name="auto", signature_version="s3v4"))

paginator = s3.get_paginator("list_objects_v2")
for page in paginator.paginate(Bucket="captchamaster", Prefix="training-data/"):
    for obj in page.get("Contents", []):
        s3.download_file("captchamaster", obj["Key"], obj["Key"])
        print("Downloaded:", obj["Key"])
```

### Option B: Google Drive theke

```python
from google.colab import drive
drive.mount('/content/drive')
!mkdir -p training_data
# Drive e image.zip rakhen, then:
!unzip -o "/content/drive/MyDrive/training.zip" -d training_data/
```

## Step 5 — Training Run

```python
!python backend/training/train_model.py
```

> Fast/quick test: `!TRAIN_EPOCHS=50 TRAIN_BATCH_SIZE=32 python backend/training/train_model.py`

## Step 6 — Model Upload (R2 te)

```python
import os, boto3
from botocore.config import Config

s3 = boto3.client("s3",
    endpoint_url="https://<account-id>.r2.cloudflarestorage.com",
    aws_access_key_id="<ACCESS_KEY>",
    aws_secret_access_key="<SECRET_KEY>",
    config=Config(region_name="auto", signature_version="s3v4"))

s3.upload_file("backend/model/best.pt", "captchamaster", "models/best.pt")
print("✅ Model uploaded! Local theke: POST /api/r2/pull/models korlei ashbe")
```

---

## 🎯 Ek cell e sob — Server + Tunnel (public URL)

Colab server public korte — **kono token lage na**:

```python
# Install tunnel
!wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
!chmod +x cloudflared-linux-amd64
!mv cloudflared-linux-amd64 /usr/local/bin/cloudflared

# Server + Tunnel
import subprocess, threading, time, re

subprocess.Popen(["python", "backend/main.py"], cwd="/content/CMM",
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(8)

log = "/content/tunnel.log"
subprocess.Popen(["cloudflared", "tunnel", "--url", "http://localhost:8000"],
    stdout=open(log, "w"), stderr=subprocess.STDOUT)

url = None
for _ in range(60):
    time.sleep(1)
    try:
        m = re.search(r"https://[a-z0-9\-]+\.trycloudflare\.com", open(log).read())
        if m: url = m.group(0); break
    except Exception: pass

if url:
    print("=" * 50)
    print(f"🚀 BACKEND URL: {url}")
    print("=" * 50)
    print("App e ei URL diye connect korun (/api auto-add hobe)")
```

**Output e `BACKEND URL: https://xxxx.trycloudflare.com`** → app e paste korlei connected.

---

## Keep Session Alive (optional)

```python
import threading, time, urllib.request
def keep():
    while True:
        try: urllib.request.urlopen("https://www.google.com")
        except Exception: pass
        time.sleep(60)
threading.Thread(target=keep, daemon=True).start()
print("Keep-alive on")
```

---

## Quick Reference

| Kaj | Cell |
|---|---|
| Clone + install | Step 2 |
| MongoDB Atlas | Step 3 |
| Data (R2/Drive) | Step 4 |
| Train | Step 5 |
| Model upload | Step 6 |
| Server + Tunnel | Last cell |

## Common Errors

| Problem | Fix |
|---|---|
| `GPU: CPU ERROR` | Runtime → Change runtime type → GPU |
| MongoDB timeout | Atlas Network Access e `0.0.0.0/0` |
| OOM (memory) | `TRAIN_BATCH_SIZE=16` diye train |
| Session disconnect | Keep-alive cell run koren |
