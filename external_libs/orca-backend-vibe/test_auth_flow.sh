#!/bin/bash

# Test Authentication Flow Script
# This script tests all authentication endpoints including password reset

API_URL="http://localhost:8090"
TEST_EMAIL="test.user@example.com"
TEST_PASSWORD="TestPassword123"
NEW_PASSWORD="NewPassword456"

echo "========================================="
echo "   Authentication Flow Test Script"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Login with wrong password
echo -e "${YELLOW}Test 1: Login with wrong password${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/v1/auth/signin" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"wrongpassword\"}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "401" ]; then
    echo -e "${GREEN}✓ Correctly returned 401${NC}"
    echo "Error message: $(echo $BODY | jq -r '.detail')"
else
    echo -e "${RED}✗ Expected 401, got $HTTP_CODE${NC}"
fi
echo ""

# Test 2: Login with correct credentials (if user exists)
echo -e "${YELLOW}Test 2: Login with correct credentials${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/v1/auth/signin" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ Login successful${NC}"
    TOKEN=$(echo $BODY | jq -r '.access_token')
    echo "Token: ${TOKEN:0:50}..."
elif [ "$HTTP_CODE" = "401" ]; then
    echo -e "${YELLOW}⚠ User doesn't exist or not confirmed${NC}"
    echo "Message: $(echo $BODY | jq -r '.detail')"
    TOKEN=""
else
    echo -e "${RED}✗ Unexpected status: $HTTP_CODE${NC}"
    TOKEN=""
fi
echo ""

# Test 3: Request password reset
echo -e "${YELLOW}Test 3: Request password reset${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/v1/auth/password/reset-request" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\"}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ Reset request successful${NC}"
    echo "Message: $(echo $BODY | jq -r '.message')"
    
    # In dev environment, token might be returned
    RESET_TOKEN=$(echo $BODY | jq -r '.reset_token // empty')
    if [ -n "$RESET_TOKEN" ] && [ "$RESET_TOKEN" != "null" ]; then
        echo "Reset Token: $RESET_TOKEN"
    fi
else
    echo -e "${RED}✗ Expected 200, got $HTTP_CODE${NC}"
    RESET_TOKEN=""
fi
echo ""

# Test 4: Verify reset token (if we have one)
if [ -n "$RESET_TOKEN" ] && [ "$RESET_TOKEN" != "null" ]; then
    echo -e "${YELLOW}Test 4: Verify reset token${NC}"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/v1/auth/password/verify-token?token=$RESET_TOKEN")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✓ Token is valid${NC}"
        echo "Message: $(echo $BODY | jq -r '.message')"
    else
        echo -e "${RED}✗ Token verification failed: $HTTP_CODE${NC}"
    fi
    echo ""
    
    # Test 5: Reset password with token
    echo -e "${YELLOW}Test 5: Reset password${NC}"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/v1/auth/password/reset" \
      -H "Content-Type: application/json" \
      -d "{\"token\":\"$RESET_TOKEN\",\"new_password\":\"$NEW_PASSWORD\"}")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✓ Password reset successful${NC}"
        echo "Message: $(echo $BODY | jq -r '.message')"
    else
        echo -e "${RED}✗ Password reset failed: $HTTP_CODE${NC}"
    fi
    echo ""
    
    # Test 6: Login with new password
    echo -e "${YELLOW}Test 6: Login with new password${NC}"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/v1/auth/signin" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$NEW_PASSWORD\"}")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✓ Login with new password successful${NC}"
        TOKEN=$(echo $BODY | jq -r '.access_token')
        echo "New Token: ${TOKEN:0:50}..."
    else
        echo -e "${RED}✗ Login failed: $HTTP_CODE${NC}"
    fi
    echo ""
fi

# Test 7: Change password (if logged in)
if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
    echo -e "${YELLOW}Test 7: Change password (while logged in)${NC}"
    
    # First try with wrong old password
    echo "  7a. Testing with wrong old password..."
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/v1/auth/password/change" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"old_password\":\"wrongpassword\",\"new_password\":\"$TEST_PASSWORD\"}")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" = "400" ]; then
        echo -e "  ${GREEN}✓ Correctly rejected wrong old password${NC}"
        echo "  Error: $(echo $BODY | jq -r '.detail')"
    else
        echo -e "  ${RED}✗ Expected 400, got $HTTP_CODE${NC}"
    fi
    
    # Now try with correct old password
    echo "  7b. Testing with correct old password..."
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/v1/auth/password/change" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"old_password\":\"$NEW_PASSWORD\",\"new_password\":\"$TEST_PASSWORD\"}")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "  ${GREEN}✓ Password change successful${NC}"
        echo "  Message: $(echo $BODY | jq -r '.message')"
    else
        echo -e "  ${RED}✗ Password change failed: $HTTP_CODE${NC}"
    fi
    echo ""
fi

# Test 8: Check auth configuration
echo -e "${YELLOW}Test 8: Check auth configuration${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/v1/auth/config")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ Auth config retrieved${NC}"
    echo "Environment: $(echo $BODY | jq -r '.environment')"
    echo "JWT enabled: $(echo $BODY | jq -r '.authentication_methods.jwt.enabled')"
    echo "Dev token enabled: $(echo $BODY | jq -r '.authentication_methods.dev_token.enabled')"
else
    echo -e "${RED}✗ Failed to get config: $HTTP_CODE${NC}"
fi
echo ""

echo "========================================="
echo "   Test Summary"
echo "========================================="
echo ""
echo "All authentication endpoints tested!"
echo ""
echo "Notes:"
echo "- If tests failed, make sure:"
echo "  1. Server is running on $API_URL"
echo "  2. Database migration has been run"
echo "  3. Test user exists in database"
echo ""
echo "To create a test user, run:"
echo "curl -X POST $API_URL/api/v1/auth/signup \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"name\":\"Test User\"}'"
echo ""
