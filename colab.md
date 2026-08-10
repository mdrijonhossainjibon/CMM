# 🚀 CaptchaMaster — Colab GPU / VPS Setup

Local CPU te training slow, Colab GPU te **10-20x fast**, VPS GPU te **full-time 24/7**.

---

## 📊 Hardware Requirements (RAM / Storage / GPU)

| Resource | Local PC | Colab (free) | VPS (GPU) | VPS (CPU) |
|---|---|---|---|---|
| **GPU** | ❌ CPU only | ✅ T4 (16GB) | ✅ RTX 4090 / A100 | ❌ CPU |
| **RAM** | 8-16 GB | 12.7 GB | 16-32 GB | 4-8 GB |
| **Storage** | 10-20 GB | 78 GB (session only) | 40-100 GB | 20-40 GB |
| **Training speed** | 1x (slow) | ~15-20x | ~30-50x | ~2-3x |
| **Uptime** | 24/7 | ~12 hr/session | 24/7 | 24/7 |
| **Cost** | Free | Free | $0.3-1/hr | $5-20/mo |
| **Batch size** | 8-16 | 32-64 | 32-64 | 8-16 |
| **Best for** | Testing | Fast training | Production 24/7 | Budget hosting |

> **VPS GPU batch size:** RTX 4090 (24GB) e `batch=64`, A100 (80GB) e `batch=128`.
> **Colab e puro session delete hoye jay** — model/data R2 te upload kora obbosshoi.

---

## ⏱ Training Speed + VRAM/RAM Estimate

### VRAM (GPU Memory) Requirement — Image Size vs Batch Size

| Img Size | Batch 8 | Batch 16 | Batch 32 | Batch 64 | Batch 128 |
|---|---|---|---|---|---|
| **640** | ~1.5 GB | ~3 GB | ~6 GB | ~12 GB | ~24 GB |
| **480** | ~0.8 GB | ~1.7 GB | ~3.4 GB | ~6.8 GB | ~13 GB |
| **416** | ~0.6 GB | ~1.3 GB | ~2.6 GB | ~5.2 GB | ~10 GB |

> **Colab T4 = 16GB VRAM** → 640 size e batch 32 thik.
> **VRAM beshi na thakle:** image size koman (640 → 480) ba batch koman.

### RAM Requirement

| Hardware | RAM lagbe | Note |
|---|---|---|
| Colab | 12.7 GB (fixed) | T4 GPU soho free |
| VPS GPU (RTX 4090) | 16-32 GB | System + data load |
| VPS GPU (A100) | 32-64 GB | Boro dataset er jonno |
| VPS CPU | 4-8 GB | Batch 8-16 e cholbe |

### Estimated Training Time (100 epochs, 640 img)

| Images | Colab T4 | RTX 4090 | Local CPU |
|---|---|---|---|
| **100** | ~25-35 min | ~10-15 min | ~3-5 hr |
| **300** | ~1-1.5 hr | ~30-45 min | ~8-12 hr |
| **500** | ~1.5-2.5 hr | ~45-70 min | ~14-20 hr |
| **1000** | ~3-5 hr | ~1.5-2 hr | ~30-40 hr |

### Estimated Training Time (40 epochs, 640 img) — quick/small model

| Images | Colab T4 | RTX 4090 | Local CPU |
|---|---|---|---|
| **100** | ~10-14 min | ~4-6 min | ~1-2 hr |
| **300** | ~24-36 min | ~12-18 min | ~3-5 hr |
| **500** | ~36-60 min | ~18-28 min | ~6-8 hr |
| **1000** | ~1.2-2 hr | ~36-48 min | ~12-16 hr |

> **40 epochs:** kom epoch — durbal model hobe, kintu fast. Testing/prototype er jonno bhalo.
> **Rule:** 40 epochs → basic model, 100-150 epochs → bhalo model, 200+ → overfit (khub beshi).

> **Formula (approx):** Colab T4 e ~1000 image/100 epoch ≈ 2.5-3.5 GB model, time = `(images × epochs) ÷ 8000` minute (approx).
> **50 epochs quick test:** uporer somoy er prothom dike. Test korar jonno 50 epoch → Colab e 100 image ≈ 12-18 min.

### Kon Batch Size Use Korben

| Hardware | Batch | Image Size | Epochs |
|---|---|---|---|
| **Colab T4** | 32 | 640 | 100-150 |
| **RTX 4090 (24GB)** | 64 | 640 | 100 |
| **A100 (80GB)** | 128 | 640 | 100 |
| **Local CPU** | 8-16 | 480 | 100-200 |
| **Quick test** | 16 | 480 | 30-50 |

> **OOM (out of memory) hole:** batch koman → image size koman → train.

---

## 🖥 VPS Setup (Ubuntu 22.04)

DigitalOcean / Vultr / Hetzner e Ubuntu VPS hole:

```bash
# 1. Update + Python
sudo apt update && sudo apt install -y python3 python3-pip python3-venv git
python3 --version

# 2. Clone
git clone https://github.com/mdrijonhossainjibon/CMM.git && cd CMM

# 3. Virtual env + install
python3 -m venv venv
source venv/bin/activate
pip install ultralytics torch torchvision --index-url https://download.pytorch.org/whl/cu121
pip install fastapi "uvicorn[standard]" python-multipart python-dotenv pydantic pydantic-settings "python-jose[cryptography]" "passlib[bcrypt]" opencv-python pillow numpy pi-heif watchfiles psutil motor pymongo google-auth boto3 websockets onnx onnxslim onnxruntime

# 4. MongoDB Atlas connect
export MONGODB_URI="mongodb+srv://USER:PASSWORD@cluster.mongodb.net/captchamaster"
export MONGODB_DB_NAME="captchamaster"

# 5. Start server (production)
nohup uvicorn backend.main:app --host 0.0.0.0 --port 8000 > server.log 2>&1 &
echo "Server: http://$(curl -s ifconfig.me):8000"

# 6. Auto-restart (PM2)
npm install -g pm2
pm2 start "uvicorn backend.main:app --host 0.0.0.0 --port 8000" --name captchamaster
pm2 save && pm2 startup

# 7. Firewall open
sudo ufw allow 8000/tcp
```

> **VPS CPU (no GPU):** CPU mode e cholbe, kintu `pip install torch torchvision` (CPU version) use korun — `cu121` wheel GPU te.
> **GPU VPS:** NVIDIA driver + CUDA install korte hobe.

---

## ☁ Colab Setup (free GPU)



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

### ⚡ Max Speed Options

| Setting | Command | Speed gain |
|---|---|---|
| **RAM cache** (default) | `python backend/training/train_model.py` | ~2-3x (image ekbar RAM e load) |
| **Boro batch** | `!TRAIN_BATCH_SIZE=64 python backend/training/train_model.py` | ~2x |
| **Choto image** | `!TRAIN_IMAGE_SIZE=480 python backend/training/train_model.py` | ~1.5x |
| **Kom epoch** | `!TRAIN_EPOCHS=40 python backend/training/train_model.py` | epoch onusare |
| **Sob ek sathe** | `!TRAIN_EPOCHS=40 TRAIN_BATCH_SIZE=64 TRAIN_IMAGE_SIZE=480 python backend/training/train_model.py` | **~6-8x** |

> **Cache:** training ekbar image RAM e load kore — prottek epoch disk read kore na. Boro dataset (1000+) hole `TRAIN_CACHE=disk` use korun (RAM bachabe, ektu slow).
>
> **1000 img/1 min:** Colab T4 e `batch=64, img=480, 1-2 epoch` diye ~1 min/epoch possible. Complete 100 epoch er jonno time = epochs × per-epoch time.

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

| Resource | Colab | VPS GPU | VPS CPU |
|---|---|---|---|
| GPU | T4 16GB | RTX 4090/A100 | CPU only |
| RAM | 12.7 GB | 16-32 GB | 4-8 GB |
| Cost | Free | $0.3-1/hr | $5-20/mo |
| Batch | 32-64 | 64-128 | 8-16 |
| Uptime | ~12hr | 24/7 | 24/7 |
| 100 img/100 ep | ~30 min | ~12 min | ~4 hr |
| 500 img/100 ep | ~2 hr | ~1 hr | ~17 hr |
| 100 img/40 ep | ~12 min | ~5 min | ~1.5 hr |
| 500 img/40 ep | ~45 min | ~23 min | ~7 hr |

## Common Errors

| Problem | Fix |
|---|---|
| `GPU: CPU ERROR` | Runtime → Change runtime type → GPU |
| MongoDB timeout | Atlas Network Access e `0.0.0.0/0` |
| OOM (memory) | `TRAIN_BATCH_SIZE=16` diye train |
| Session disconnect | Keep-alive cell run koren |
| VPS `torch` GPU error | VPS CPU hole CUDA wheel na — plain `pip install torch` |

---

## 💻 Colab Terminal Commands (cell na, terminal)

Notebook cell er bodole Colab **terminal** use korle:

```bash
# 1. Clone
git clone https://github.com/mdrijonhossainjibon/CMM.git && cd CMM

# 2. Install
pip install ultralytics torch torchvision --index-url https://download.pytorch.org/whl/cu121
pip install fastapi "uvicorn[standard]" python-multipart python-dotenv pydantic pydantic-settings "python-jose[cryptography]" "passlib[bcrypt]" opencv-python pillow numpy pi-heif watchfiles psutil motor pymongo google-auth boto3 websockets onnx onnxslim onnxruntime

# 3. GPU check
python -c "import torch; print('GPU:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'NO GPU')"

# 4. MongoDB
export MONGODB_URI="mongodb+srv://USER:PASSWORD@cluster.mongodb.net/captchamaster"
export MONGODB_DB_NAME="captchamaster"

# 5. Train
python backend/training/train_model.py

# 6. Fast test
TRAIN_EPOCHS=50 TRAIN_BATCH_SIZE=32 python backend/training/train_model.py

# 7. Server + Tunnel (public URL)
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x cloudflared-linux-amd64 && mv cloudflared-linux-amd64 /usr/local/bin/cloudflared
nohup python backend/main.py > server.log 2>&1 &
nohup cloudflared tunnel --url http://localhost:8000 > tunnel.log 2>&1 &
sleep 15 && grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' tunnel.log | head -1
```

> Terminal e `nohup ... &` use kore background e chalano hoy — server + tunnel eko sathe chole.
