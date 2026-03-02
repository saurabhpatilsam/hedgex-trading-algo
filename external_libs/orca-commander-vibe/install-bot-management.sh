#!/bin/bash

# Bot Management System - Dependency Installation
# Run this script to install all required dependencies

echo "🤖 Installing Bot Management System dependencies..."
echo ""

# Install axios for HTTP client
echo "📦 Installing axios..."
npm install axios

# Install Supabase client for real-time updates (optional)
echo "📦 Installing @supabase/supabase-js..."
npm install @supabase/supabase-js

echo ""
echo "✅ Installation complete!"
echo ""
echo "Next steps:"
echo "1. Add environment variables to .env.local:"
echo "   - NEXT_PUBLIC_API_BASE_URL=http://localhost:8000"
echo "   - NEXT_PUBLIC_SUPABASE_URL=your-supabase-url"
echo "   - NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key"
echo ""
echo "2. Check BOT_MANAGEMENT_INTEGRATION.md for usage examples"
echo ""
