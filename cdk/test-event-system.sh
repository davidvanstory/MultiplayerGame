#!/bin/bash

# Test script for Phase 3 Event System Implementation

echo "🎮 Testing Multiplayer Event System - Phase 3"
echo "============================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in the CDK directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: Run this script from the cdk directory${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 1: Checking created files...${NC}"
echo "----------------------------------------"

# Check if files exist
FILES=(
    "frontend/multiplayer-lib.js"
    "frontend/test-event-system.html"
)

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $file exists"
    else
        echo -e "${RED}✗${NC} $file missing"
    fi
done

echo ""
echo -e "${YELLOW}Step 2: Starting local development server...${NC}"
echo "----------------------------------------"
echo "Starting server on http://localhost:3000"
echo ""

# Start the dev server in background
npm run dev &
SERVER_PID=$!
sleep 3

echo -e "${GREEN}✓${NC} Server started with PID: $SERVER_PID"
echo ""

echo -e "${YELLOW}Step 3: Test URLs${NC}"
echo "----------------------------------------"
echo "1. Test Event System: http://localhost:3000/test-event-system.html"
echo "2. Main Application: http://localhost:3000"
echo "3. Debug Mode: http://localhost:3000/index-debug.html"
echo ""

echo -e "${YELLOW}Step 4: Manual Testing Instructions${NC}"
echo "----------------------------------------"
echo "1. Open http://localhost:3000/test-event-system.html"
echo "   - Click on game cells to test INTERACTION events"
echo "   - Click control buttons to test TRANSITION events"
echo "   - Watch turn changes for UPDATE events"
echo "   - Check the Event Console on the right"
echo ""
echo "2. Open http://localhost:3000 in another tab"
echo "   - Go to 'Create with AI' tab"
echo "   - Select a game type and generate a game"
echo "   - Click the Debug Console button (bottom-right)"
echo "   - Watch for events from the generated game"
echo ""
echo "3. Test multiplayer conversion:"
echo "   - Go to 'Convert to Multiplayer' tab"
echo "   - Paste a simple HTML game"
echo "   - Click 'Convert to Multiplayer'"
echo "   - Check if events are captured in Debug Console"
echo ""

echo -e "${YELLOW}Step 5: Verify Event System Components${NC}"
echo "----------------------------------------"
echo "Checking for key functions in multiplayer-lib.js..."

if grep -q "GameEventBridge" frontend/multiplayer-lib.js; then
    echo -e "${GREEN}✓${NC} GameEventBridge class found"
fi

if grep -q "TRANSITION.*INTERACTION.*UPDATE.*ERROR" frontend/multiplayer-lib.js; then
    echo -e "${GREEN}✓${NC} All 4 event types supported"
fi

if grep -q "postMessage" frontend/multiplayer-lib.js; then
    echo -e "${GREEN}✓${NC} Parent frame communication implemented"
fi

if grep -q "MutationObserver" frontend/multiplayer-lib.js; then
    echo -e "${GREEN}✓${NC} State change monitoring implemented"
fi

echo ""
echo -e "${YELLOW}Step 6: Check Lambda Function Updates${NC}"
echo "----------------------------------------"

if grep -q "injectMultiplayerLibrary" lambda/ai-convert.js; then
    echo -e "${GREEN}✓${NC} Multiplayer library injection added to Lambda"
fi

if grep -q "data-game-action" lambda/ai-convert.js; then
    echo -e "${GREEN}✓${NC} Data attribute injection implemented"
fi

echo ""
echo -e "${YELLOW}Step 7: Deployment Readiness${NC}"
echo "----------------------------------------"
echo "To deploy to AWS:"
echo "1. Set OPENAI_API_KEY environment variable"
echo "2. Run: npm run build"
echo "3. Run: npm run deploy"
echo "4. Upload frontend files: npm run upload"
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Phase 3 Implementation Test Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Server is running on PID: $SERVER_PID"
echo "Press Ctrl+C to stop the server and exit"
echo ""

# Wait for user to press Ctrl+C
trap "echo ''; echo 'Stopping server...'; kill $SERVER_PID 2>/dev/null; exit" INT
wait $SERVER_PID