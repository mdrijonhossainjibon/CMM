FROM python:3.11-slim

# Install system dependencies for OpenCV and Ultralytics
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ ./backend/

# Create necessary directories
RUN mkdir -p backend/model exports logs uploads training_data training_queue

# Expose port
EXPOSE 8000

# Run the application
CMD ["python", "-m", "backend.main"]
