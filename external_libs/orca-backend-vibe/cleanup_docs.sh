#!/bin/bash

# Documentation Cleanup Script - Option 1: Conservative Cleanup
# This script removes implementation/fix documentation while keeping essential docs

echo "🧹 Starting Conservative Documentation Cleanup..."
echo "=================================="

# Files to KEEP (will NOT be deleted):
echo "📁 Files that will be KEPT:"
echo "  ✅ README.md"
echo "  ✅ API_ENDPOINTS_REFERENCE.md"
echo "  ✅ BOT_MANAGEMENT_FRONTEND_API.md"
echo "  ✅ FRONTEND_API_QUICK_REFERENCE.md"
echo "  ✅ FRONTEND_DEBUG_GUIDE.md"
echo ""

# Files to DELETE:
echo "🗑️  Files that will be DELETED:"
FILES_TO_DELETE=(
    "ASYNC_API_GUIDE.md"
    "ASYNC_API_IMPROVEMENTS.md"
    "AUTH_ERROR_MESSAGES.md"
    "AUTH_IMPLEMENTATION_SUMMARY.md"
    "AUTH_SETUP_README.md"
    "AZURE_DEPLOYMENT_FIX.md"
    "BOT_MANAGEMENT_SUPABASE.md"
    "BOT_MANAGEMENT_SYSTEM.md"
    "DUAL_AUTHENTICATION_GUIDE.md"
    "DUPLICATE_DETECTION.md"
    "ENDPOINT_404_FIX.md"
    "ENDPOINT_AUTHENTICATION_STATUS.md"
    "FRONTEND_INTEGRATION_SUMMARY.md"
    "FRONTEND_ISSUE_SUMMARY.md"
    "IMPLEMENTATION_COMPLETE.md"
    "IMPLEMENTATION_SUMMARY.md"
    "NON_BLOCKING_BOT_FIX.md"
    "PASSWORD_RESET_GUIDE.md"
    "PASSWORD_RESET_IMPLEMENTATION.md"
    "QUICK_START_AUTH.md"
    "QUICK_START_DUPLICATES.md"
    "QUICK_START_PASSWORD_RESET.md"
    "RUN_CONFIG_TRACKING.md"
    "CLEANUP_REVIEW.md"
)

# Display files to be deleted
for file in "${FILES_TO_DELETE[@]}"; do
    if [ -f "$file" ]; then
        echo "  ❌ $file"
    fi
done

echo ""
echo "=================================="
read -p "⚠️  Are you sure you want to delete these files? (y/N): " confirm

if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
    echo ""
    echo "🗑️  Deleting files..."
    
    deleted_count=0
    for file in "${FILES_TO_DELETE[@]}"; do
        if [ -f "$file" ]; then
            rm -f "$file"
            echo "   ✓ Deleted: $file"
            ((deleted_count++))
        fi
    done
    
    echo ""
    echo "✅ Cleanup complete! Deleted $deleted_count files."
    echo ""
    echo "📋 Remaining documentation files:"
    ls -1 *.md 2>/dev/null | while read file; do
        echo "   📄 $file"
    done
else
    echo "❌ Cleanup cancelled."
fi
