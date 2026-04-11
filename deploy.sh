#!/bin/bash

echo "🚀 Deploying..."

cd /home/rewardApp

echo "📥 Pulling latest code..."
git pull origin main

echo "🐍 Activating venv..."
source venv/bin/activate

echo "📦 Installing dependencies..."
pip install -r requirements.txt

echo "🗄 Running migrations..."
python manage.py migrate

echo "🎨 Collecting static..."
python manage.py collectstatic --noinput

echo "🔁 Restarting app..."
sudo systemctl restart rewardApp

echo "✅ Deploy complete!"
