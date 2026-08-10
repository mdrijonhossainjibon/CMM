# Google Colab GPU Backend Setup

Colab er free GPU te CaptchaMaster training chalano jay — local CPU te training khub slow hoy, Colab GPU te 10-20x fast.

## 1. Colab Notebook Khulun

1. [colab.research.google.com](https://colab.research.google.com) → **New Notebook**
2. Menu → **Runtime** → **Change runtime type**
3. **Hardware accelerator** → **GPU** (T4 / A100) → **Save**
4. Runtime → **Run all** na, step by step run koren

## 2. Repository Clone + Dependencies

```python
# Cell 1 — Clone repo
!git clone https://github.com/mdrijonhossainjibon/CMM.git
%cd /content/CMM

# Cell 2 — Install Python deps
!pip install -q ultralytics torch torchvision --index-url https://download.pytorch.org/whl/cu121
!pip install -q opencv-python pillow numpy pyyaml boto3 pymongo

# Cell 3 — Check GPU
import torch
print("CUDA available:", torch.cuda.is_available())
print("GPU:", torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU")
```

> Output e `True` + GPU name (e.g. `Tesla T4`) dekhte hobe. `False` ashle Runtime → Change runtime type → GPU select koren.

## 3. MongoDB Connection

Colab theke local MongoDB e direct connect kora jay na (localhost accessible na). Duita option:

### Option A — MongoDB Atlas (recommended)

1. [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas) → free cluster create
2. **Database Access** → user create (password copy)
3. **Network Access** → **Add IP** → `0.0.0.0/0` (anywhere — Colab IP change hoy)
4. **Connect** → connection string copy:

```
mongodb+srv://USER:PASSWORD@cluster.mongodb.net
```

```python
# Cell 4 — Set MongoDB env
import os
os.environ["MONGODB_URI"] = "mongodb+srv://USER:PASSWORD@cluster.mongodb.net"
os.environ["MONGODB_DB_NAME"] = "captchamaster"
```

### Option B — ngrok Tunnel (local MongoDB e)

```python
!pip install -q pymongo
!pip install -q pyngrok
!apt-get -q install mongodb
!service mongodb start

from pyngrok import ngrok
ngrok.set_auth_token("YOUR_NGROK_TOKEN")  # https://dashboard.ngrok.com
tunnel = ngrok.connect(27017, "tcp")
print("MongoDB tunnel:", tunnel.public_url)  # e.g. 0.tcp.ngrok.io:12345
```

> Local machine e `mongosh "mongodb+srv://..."` use kore Colab tunnel theke connect hote hobe. Eta local Mongo te data sync er jonno.

## 4. Training Data Upload (R2 / Drive)

### R2 theke pull (R2 enabled thakle)

```python
# Cell 5 — Pull training data from R2
import boto3
from botocore.config import Config

s3 = boto3.client(
    "s3",
    endpoint_url="https://<account-id>.r2.cloudflarestorage.com",
    aws_access_key_id="ACCESS_KEY",
    aws_secret_access_key="SECRET_KEY",
    config=Config(region_name="auto", signature_version="s3v4"),
)

# Download training-data prefix
bucket = "captchamaster"
paginator = s3.get_paginator("list_objects_v2")
for page in paginator.paginate(Bucket=bucket, Prefix="training-data/"):
    for obj in page.get("Contents", []):
        key = obj["Key"]
        local = key  # training-data/<file>
        os.makedirs(os.path.dirname(local), exist_ok=True)
        s3.download_file(bucket, key, local)
        print("Downloaded:", key)

print("Files:", len(os.listdir("training-data")) if os.path.exists("training-data") else 0)
```

### Google Drive theke (alternative)

```python
# Cell 5b — Mount Drive (image zip thakle)
from google.colab import drive
drive.mount('/content/drive')

!mkdir -p training_data
# Training images zip kore Drive e rakhen, then:
!unzip -o "/content/drive/MyDrive/captcha_training.zip" -d training_data/
```

> **Training data structure:** `training_data/` folder e image gulo `classname_timestamp.jpg` format e thakte hobe. `_` er age part = class name.

## 5. Training Run

```python
# Cell 6 — Run training (GPU)
!python backend/training/train_model.py

# Custom config (optional)
!TRAIN_DATASET_TYPE=custom \
  TRAIN_EPOCHS=100 \
  TRAIN_BATCH_SIZE=32 \
  TRAIN_IMAGE_SIZE=640 \
  TRAINING_DEVICE=0 \
  python backend/training/train_model.py
```

> **Note:** Colab e 100 epochs e batch size 32-64 use kora jay (T4 = 16GB VRAM). Local 16 er bodole Colab e 32-64 diye train korben — faster.

## 6. Model Export + Upload

```python
# Cell 7 — Best model upload to R2
best = "backend/model/best.pt"
if os.path.exists(best):
    s3.upload_file(best, bucket, "models/best.pt")
    print("Uploaded models/best.pt")

    # ONNX export
    from ultralytics import YOLO
    model = YOLO(best)
    model.export(format="onnx", imgsz=640)
    s3.upload_file("backend/model/best.onnx", bucket, "models/best.onnx")
    print("Uploaded models/best.onnx")
else:
    print("Training failed — best.pt not found")

# Download locally from Colab
from google.colab import files
files.download("backend/model/best.pt")
```

## 7. Model Pull to Local Machine

Colab e train korar por model ferot anar 2 upay:

### Via R2 (recommended)

Local API theke:
```
POST /api/r2/pull/models
```
R2 te upload hoye geche — local theke pull korlei neme ashbe `exports/` folder e.

### Via Drive

```python
# Colab e: save to Drive
!cp backend/model/best.pt "/content/drive/MyDrive/best.pt"
```

## 8. Colab Session Keep-Alive (Auto-Disconnect Rokhte)

Colab 90 min idle thakle disconnect kore dey. Eta chalale connected thakbe:

```python
# Cell 8 — Keep session alive (background)
import threading, time

def keep_alive():
    while True:
        try:
            import urllib.request
            urllib.request.urlopen("https://www.google.com")
        except Exception:
            pass
        time.sleep(60)

thread = threading.Thread(target=keep_alive, daemon=True)
thread.start()
print("Keep-alive started. Notebook connected thakbe.")
```

> Colab free tier e max ~12 hour continuous session thake. Beshi time lagle re-run korte hobe.

## Quick Reference

| Item | Value |
|---|---|
| Colab GPU | T4 (16GB VRAM) / A100 free tier |
| PyTorch | CUDA 12.1 wheels |
| Batch size | 32-64 (GPU) vs 16 (local CPU) |
| MongoDB | Atlas recommended (0.0.0.0/0 network) |
| Data sync | R2 (`training-data/` prefix) |
| Model output | R2 (`models/` prefix) → `/api/r2/pull/models` |
| Session limit | ~12 hr (free) |

## Common Errors

| Error | Solution |
|---|---|
| `CUDA available: False` | Runtime → Change runtime type → GPU |
| Session disconnected | Keep-alive cell chalan + Drive mount |
| MongoDB connection timeout | Atlas network access `0.0.0.0/0` |
| Out of memory (OOM) | Batch size koman (32 → 16) |
| R2 not configured | Settings page e credentials set + Test Connection |
