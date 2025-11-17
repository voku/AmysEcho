#!/bin/bash
# End-to-End Gesture Recognition System Verification
# This script tests the complete workflow from sample recording to model serving

set -e

echo "========================================="
echo "Gesture Recognition System Verification"
echo "========================================="
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_DIR="$REPO_ROOT/server"
APP_DIR="$REPO_ROOT/app"
INTEGRATION_DIR="$REPO_ROOT/integration"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

function print_success {
    echo -e "${GREEN}✓${NC} $1"
}

function print_error {
    echo -e "${RED}✗${NC} $1"
}

function print_info {
    echo -e "${YELLOW}ℹ${NC} $1"
}

# Step 1: Check dependencies
echo "Step 1: Checking dependencies..."
if ! command -v node &> /dev/null; then
    print_error "Node.js not found. Please install Node.js 18+"
    exit 1
fi
print_success "Node.js found: $(node --version)"

if ! command -v python3 &> /dev/null; then
    print_error "Python3 not found. Please install Python 3.8+"
    exit 1
fi
print_success "Python3 found: $(python3 --version)"

if ! command -v npm &> /dev/null; then
    print_error "npm not found. Please install npm"
    exit 1
fi
print_success "npm found: $(npm --version)"

echo ""

# Step 2: Install dependencies
echo "Step 2: Installing dependencies..."
print_info "Installing app dependencies..."
cd "$APP_DIR"
npm ci --silent > /dev/null 2>&1 || {
    print_error "Failed to install app dependencies"
    exit 1
}
print_success "App dependencies installed"

print_info "Installing server dependencies..."
cd "$SERVER_DIR"
npm ci --silent > /dev/null 2>&1 || {
    print_error "Failed to install server dependencies"
    exit 1
}
print_success "Server dependencies installed"

print_info "Installing Python dependencies..."
pip install -q -r requirements.txt > /dev/null 2>&1 || {
    print_error "Failed to install Python dependencies"
    exit 1
}
print_success "Python dependencies installed"

print_info "Installing integration test dependencies..."
cd "$INTEGRATION_DIR"
npm ci --silent > /dev/null 2>&1 || {
    print_error "Failed to install integration dependencies"
    exit 1
}
print_success "Integration dependencies installed"

echo ""

# Step 3: Type checking
echo "Step 3: Type checking..."
print_info "Checking app types..."
cd "$APP_DIR"
npm run type-check > /dev/null 2>&1 || {
    print_error "App type check failed"
    exit 1
}
print_success "App types valid"

print_info "Checking server types..."
cd "$SERVER_DIR"
npm run type-check > /dev/null 2>&1 || {
    print_error "Server type check failed"
    exit 1
}
print_success "Server types valid"

echo ""

# Step 4: Run tests
echo "Step 4: Running tests..."
print_info "Running app tests (this may take a minute)..."
cd "$APP_DIR"
npm test > /tmp/app-test.log 2>&1 || {
    print_error "App tests failed. Check /tmp/app-test.log"
    tail -20 /tmp/app-test.log
    exit 1
}
APP_TESTS=$(grep -o "Tests:.*passed" /tmp/app-test.log | head -1)
print_success "App tests: $APP_TESTS"

print_info "Running server tests..."
cd "$SERVER_DIR"
npm test > /tmp/server-test.log 2>&1 || {
    print_error "Server tests failed. Check /tmp/server-test.log"
    tail -20 /tmp/server-test.log
    exit 1
}
SERVER_TESTS=$(grep -E "passed|Tests:" /tmp/server-test.log | tail -3 | head -1)
print_success "Server tests: $SERVER_TESTS"

echo ""

# Step 5: Test training script
echo "Step 5: Testing training pipeline..."
print_info "Setting up test data directory..."
mkdir -p "$SERVER_DIR/data/datasets"
mkdir -p "$SERVER_DIR/data/models/global"
mkdir -p "$SERVER_DIR/data/uploads"

# Create empty manifest if it doesn't exist
if [ ! -f "$SERVER_DIR/data/datasets/training_manifest.json" ]; then
    echo '{"version":"1.0","entries":[]}' > "$SERVER_DIR/data/datasets/training_manifest.json"
fi

print_info "Running training script with empty data..."
cd "$SERVER_DIR"
TRAINING_OUTPUT=$(python3 src/amyserver_tools/train_mlp.py 2>&1)
echo "$TRAINING_OUTPUT" | grep -q "totalSamples" || {
    print_error "Training script output format unexpected"
    echo "$TRAINING_OUTPUT"
    exit 1
}
print_success "Training script runs successfully"

SAMPLE_COUNT=$(echo "$TRAINING_OUTPUT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('totalSamples', 0))" 2>/dev/null || echo "0")
print_info "Trained with $SAMPLE_COUNT samples"

echo ""

# Step 6: Test zero model generation
echo "Step 6: Testing zero model generation..."
print_info "Generating zero-initialized model..."
TEST_MODEL_PATH="$SERVER_DIR/data/models/global/test_model.npz"
echo '{"labels":["TEST1","TEST2"],"counts":[0,0],"inputSize":126,"hiddenSize":128}' | \
    python3 "$SERVER_DIR/src/amyserver_tools/generate_zero_model.py" "$TEST_MODEL_PATH" 2>&1 || {
    print_error "Zero model generation failed"
    exit 1
}

if [ -f "$TEST_MODEL_PATH" ]; then
    print_success "Zero model generated at $TEST_MODEL_PATH"
    # Verify model format
    python3 -c "import numpy as np; m = np.load('$TEST_MODEL_PATH'); assert 'labels' in m.files" || {
        print_error "Model format invalid"
        exit 1
    }
    print_success "Model format verified"
    rm "$TEST_MODEL_PATH"
else
    print_error "Model file not created"
    exit 1
fi

echo ""

# Step 7: Integration tests
echo "Step 7: Running integration tests..."
print_info "Building server..."
cd "$SERVER_DIR"
npm run build > /dev/null 2>&1 || {
    print_error "Server build failed"
    exit 1
}
print_success "Server built"

print_info "Running integration tests (this starts a test server)..."
cd "$INTEGRATION_DIR"
npm test > /tmp/integration-test.log 2>&1 || {
    print_error "Integration tests failed. Check /tmp/integration-test.log"
    tail -30 /tmp/integration-test.log
    exit 1
}
INTEGRATION_TESTS=$(grep -E "pass [0-9]" /tmp/integration-test.log | tail -1)
print_success "Integration tests: $INTEGRATION_TESTS"

echo ""

# Step 8: Summary
echo "========================================="
echo "            VERIFICATION SUMMARY"
echo "========================================="
echo ""
print_success "Dependencies: All installed"
print_success "Type Checking: Passed"
print_success "App Tests: $APP_TESTS"
print_success "Server Tests: Passed"
print_success "Training Pipeline: Working"
print_success "Model Generation: Working"
print_success "Integration Tests: $INTEGRATION_TESTS"
echo ""
echo -e "${GREEN}All checks passed! The gesture recognition system is working.${NC}"
echo ""
echo "Next steps:"
echo "  1. Start server: cd server && npm start"
echo "  2. Run mobile app: cd app && npm run android"
echo "  3. Record training samples in the app"
echo "  4. Watch models improve over time!"
echo ""
echo "For more information, see:"
echo "  - docs/CORE_GESTURE_RECOGNITION.md"
echo "  - docs/QUICK_START_GESTURE_RECOGNITION.md"
echo ""
