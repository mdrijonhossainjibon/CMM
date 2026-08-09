from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    APP_NAME: str = "CaptchaMaster AI Trainer"
    APP_SHORT_NAME: str = "CM Trainer"
    APP_CODE_NAME: str = "CM-AI"
    APP_VERSION: str = "3.0.0"
    DEBUG: bool = True

    # JWT
    SECRET_KEY: str = "change-this-to-a-random-secret-key-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:8000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8000",
        "https://*.vercel.app",
    ]
    CORS_ALLOW_ALL: bool = False

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

    # Security
    RATE_LIMIT_PER_MINUTE: int = 300
    ALLOWED_UPLOAD_EXTENSIONS: List[str] = [".jpg", ".jpeg", ".png", ".webp"]
    MAX_UPLOAD_SIZE_MB: int = 50

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
