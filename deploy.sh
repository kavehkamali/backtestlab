#!/bin/bash
# Deploy script — runs on the AWS box
# Usage: ssh aws-jump 'bash -s' < deploy.sh

set -e

APP_DIR="$HOME/equilima"
REPO="https://github.com/kavehkamali/equilima.git"

echo "=== Equilima Deploy ==="

# Install system deps if needed
if ! command -v node &>/dev/null; then
    echo "[1/5] Installing Node.js..."
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    sudo yum install -y nodejs
fi

if ! command -v pip3 &>/dev/null; then
    echo "pip3 already available"
fi

# Clone or pull repo
if [ -d "$APP_DIR" ]; then
    echo "[2/5] Pulling latest code..."
    cd "$APP_DIR"
    git pull origin main
else
    echo "[2/5] Cloning repo..."
    git clone "$REPO" "$APP_DIR"
    cd "$APP_DIR"
fi

# Install Python deps
echo "[3/5] Installing Python dependencies..."
pip3 install --user -q fastapi uvicorn yfinance pandas numpy torch scikit-learn ta pydantic python-dateutil 2>/dev/null || true

# Build frontend
echo "[4/5] Building frontend..."
cd frontend
npm install --production=false
npm run build
cd ..

# Stop existing instance
echo "[5/5] Starting server..."
pkill -f "uvicorn app.main" 2>/dev/null || true
sleep 1

# Load environment variables if they exist
[ -f ~/.equilima_env ] && source ~/.equilima_env

# Start server
cd backend
nohup ~/.local/bin/uvicorn app.main:app --host 127.0.0.1 --port 8080 > ~/equilima.log 2>&1 &

echo ""
echo "=== Deployed! ==="
echo "Server running on port 8080"
echo "Log: ~/equilima.log"
echo "URL: http://$(curl -s ifconfig.me):8080"
