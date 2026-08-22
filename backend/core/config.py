from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    APP_NAME: str = "CaptchaMaster AI Trainer"
    APP_SHORT_NAME: str = "CM Trainer"
    APP_CODE_NAME: str = "CM-AI"
    APP_VERSION: str = "3.0.0"
    DEBUG: bool = True

    # MongoDB
    MONGODB_URI: str = "mongodb+srv://one-service-bd:Ff6v2qPW%237z2UWG@one-service-bd.z6owofr.mongodb.net/captchamaster"
    MONGODB_DB_NAME: str = "captchamaster"

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""

    # Super Admin (auto-created on first run)
    SUPER_ADMIN_USERNAME: str = "superadmin"
    SUPER_ADMIN_PASSWORD: str = "superadmin123"

    # JWT
    SECRET_KEY: str = "change-this-to-a-random-secret-key-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # CORS — allowed via regex in main.py (any https?:// origin)
    
    # Model
    MODEL_PATH: str = "backend/model/best.pt"

    # Training
    TRAINING_SCRIPT_PATH: str = "backend/training/train_model.py"
    PROGRESS_FILE_PATH: str = "runs/train_progress.txt"
    TRAINING_QUEUE_DIR: str = "training_queue"

    # Upload
    UPLOAD_DIR: str = "uploads"
    TRAINING_DATA_DIR: str = "training_data"

    # Dataset
    DATASET_DIR: str = "dataset"

    # Dataset ZIP storage
    STORAGE_DIR: str = "storage"
    BACKUPS_DIR: str = "storage/backups"
    ZIP_TRAINING_DATA_DIR: str = "storage/training_data"
    MAX_ZIP_SIZE_MB: int = 1024  # 1 GB
    ALLOWED_IMAGE_EXTS: tuple = (".jpg", ".jpeg", ".png", ".webp", ".bmp")

    # Logs
    LOGS_DIR: str = "logs"

    # Exports
    EXPORTS_DIR: str = "exports"

    # Model Output Types
    TRAINING_TYPES: dict = {
        "aws": {"name": "AWS Captcha Detection", "output_prefix": "aws"},
        "kbs": {"name": "KBS Captcha Detection", "output_prefix": "kbs"},
        "kb-l": {"name": "KB Login Captcha", "output_prefix": "kb-l"},
        "custom": {"name": "Custom Model", "output_prefix": "custom"},
    }

    # Scene Classifier
    SCENE_MODEL_PATH: str = "backend/vision/models/scene_efficientnet.pt"
    SCENE_CLASSES_PATH: str = "backend/vision/models/scene_classes.json"
    BG_DATASET_DIR: str = "datasets/backgrounds"
    BG_TRAIN_SCRIPT_PATH: str = "backend/vision/train_bg.py"
    BG_PROGRESS_FILE_PATH: str = "runs/bg_train_progress.txt"

    # Security
    RATE_LIMIT_PER_MINUTE: int = 300
    ALLOWED_UPLOAD_EXTENSIONS: List[str] = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]
    MAX_UPLOAD_SIZE_MB: int = 50

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
