#!/bin/bash
# =============================================================================
# Maninos AI - Development Startup Script
# =============================================================================

echo "🏠 Starting Maninos AI Development Environment..."

# Check for .env file
if [ ! -f .env ]; then
    echo "⚠️  Warning: .env file not found. Copy .env.example to .env and configure."
fi

# Start FastAPI backend
echo "🚀 Starting API server on port 8000..."
cd "$(dirname "$0")"
uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload &
API_PID=$!

# Wait for API to start
sleep 2

# Start Next.js frontend
echo "🌐 Starting frontend on port 3000..."
cd web
npm run dev &
WEB_PID=$!

echo ""
echo "✅ Development servers started!"
echo "   API:      http://localhost:8000"
echo "   Frontend: http://localhost:3000"
echo "   Portal:   http://localhost:3000/homes"
echo ""
echo "Press Ctrl+C to stop all servers"

# Handle shutdown
trap "kill $API_PID $WEB_PID 2>/dev/null; exit" INT TERM

# Wait for processes
wait


