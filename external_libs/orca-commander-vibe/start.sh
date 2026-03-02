#!/bin/bash

echo "🚀 Starting Orca Trading Dashboard..."
echo "📊 Dashboard will be available at: http://localhost:3000"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Start the development server
echo "🔥 Starting development server..."
npm run dev
