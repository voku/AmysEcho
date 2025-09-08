# OpenAI Gesture Validation Integration Tests

This directory contains comprehensive integration tests for the OpenAI Vision-powered gesture validation system implemented in Amy's Echo.

## 🧪 Test Overview

The integration tests cover the complete OpenAI validation pipeline:

### **1. Server Integration Tests** (`server/test/integration/`)
- **OpenAI Vision Service Integration**: Tests the core OpenAI Vision service with mocked API calls
- **API Endpoint Testing**: Validates the `/api/gesture/validate-vision` endpoint
- **Error Handling**: Tests fallback scenarios and malformed responses
- **Authentication**: Verifies auth middleware integration
- **Rate Limiting**: Tests request throttling mechanisms

### **2. Client Integration Tests** (`app/test/integration/`)
- **React Native Service Integration**: Tests the client-side validation service
- **Component Integration**: Tests OpenAI feedback component rendering and interaction
- **MediaPipe Integration**: Tests the integration between MediaPipe detection and OpenAI validation
- **Fallback Logic**: Tests graceful degradation when OpenAI is unavailable
- **Adaptive Thresholds**: Tests dynamic confidence threshold adjustments

### **3. End-to-End Tests** (`integration/test/`)
- **Complete Flow Testing**: Tests the entire pipeline from app to server and back
- **Data Integrity**: Verifies data consistency throughout the pipeline
- **Performance Testing**: Tests concurrent requests and response times
- **Error Recovery**: Tests system resilience and recovery mechanisms
- **Load Testing**: Tests system behavior under multiple concurrent validations

## 🚀 Running the Tests

### Prerequisites

1. **Environment Setup**:
   ```bash
   # Set required environment variables
   export OPENAI_API_KEY="your-openai-api-key"
   export EXPO_PUBLIC_API_URL="http://localhost:5000"
   export EXPO_PUBLIC_API_TOKEN="test-token"
   ```

2. **Dependencies**:
   ```bash
   # Install server dependencies
   cd server && npm install

   # Install app dependencies
   cd ../app && npm install

   # Install integration test dependencies
   cd ../integration && npm install
   ```

3. **Start Test Server**:
   ```bash
   # Start the server for integration tests
   cd server && npm run start:test
   ```

### Running All Tests

```bash
# Run all OpenAI integration tests
node openai-test-runner.js

# Or run with npm script (if configured)
npm run test:openai-integration
```

### Running Specific Test Categories

```bash
# Run only server integration tests
node openai-test-runner.js --server

# Run only client integration tests
node openai-test-runner.js --client

# Run only end-to-end tests
node openai-test-runner.js --e2e
```

### Running Individual Test Files

```bash
# Server integration tests
npx jest server/test/integration/openaiVisionIntegration.test.ts --verbose

# Client integration tests
npx jest app/test/integration/openaiGestureValidationIntegration.test.tsx --verbose

# End-to-end tests
npx jest integration/test/openai-validation-e2e.test.js --verbose
```

## 📋 Test Files Structure

```
integration/
├── test/
│   ├── jest.config.js                 # Jest configuration for integration tests
│   ├── setup.js                      # Test setup and global mocks
│   ├── openai-validation-e2e.test.js # End-to-end integration tests
│   └── ...
├── openai-test-runner.js             # Custom test runner script
└── OPENAI_INTEGRATION_TESTS_README.md # This file

server/test/integration/
└── openaiVisionIntegration.test.ts   # Server-side integration tests

app/test/integration/
├── openaiGestureValidationIntegration.test.tsx # Client service integration
└── mediapipeOpenaiIntegration.test.tsx        # MediaPipe + OpenAI integration
```

## 🔧 Test Configuration

### Jest Configuration (`integration/test/jest.config.js`)

```javascript
module.exports = {
  preset: 'react-native',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.test.js'],
  transform: { '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest' },
  transformIgnorePatterns: ['node_modules/(?!...)'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  testTimeout: 30000, // 30 seconds for integration tests
  verbose: true,
};
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key for vision service | Required |
| `EXPO_PUBLIC_API_URL` | Server URL for API calls | `http://localhost:5000` |
| `EXPO_PUBLIC_API_TOKEN` | Authentication token | `test-token` |

## 🧪 Test Scenarios Covered

### **Server Integration Tests**

1. **API Endpoint Functionality**
   - Valid request/response handling
   - Base64 image processing
   - Context parameter inclusion
   - Processing time tracking

2. **Error Handling**
   - OpenAI API failures
   - Malformed responses
   - Network timeouts
   - Authentication errors

3. **Service Integration**
   - OpenAI Vision service calls
   - Response parsing and validation
   - Fallback result generation
   - Health check functionality

### **Client Integration Tests**

1. **Service Integration**
   - API communication
   - Request/response handling
   - Error recovery
   - Authentication flow

2. **Component Integration**
   - OpenAI feedback display
   - User interaction handling
   - State management
   - Accessibility features

3. **MediaPipe Integration**
   - Automatic validation triggers
   - Result merging logic
   - Fallback to MediaPipe detection
   - Performance under load

### **End-to-End Tests**

1. **Complete Pipeline**
   - Image capture to validation
   - Server processing
   - Result delivery to client
   - UI feedback display

2. **Data Integrity**
   - Request/response consistency
   - Context preservation
   - Error propagation
   - State synchronization

3. **Performance & Load**
   - Concurrent request handling
   - Response time validation
   - Memory usage monitoring
   - Resource cleanup

## 🐛 Debugging Failed Tests

### Common Issues and Solutions

1. **OpenAI API Key Missing**
   ```bash
   export OPENAI_API_KEY="your-key-here"
   ```

2. **Server Not Running**
   ```bash
   cd server && npm run start:test
   ```

3. **Port Conflicts**
   ```bash
   # Check if port 5000 is available
   lsof -i :5000
   ```

4. **Dependency Issues**
   ```bash
   # Clear node_modules and reinstall
   rm -rf node_modules package-lock.json
   npm install
   ```

5. **Mock Configuration**
   ```javascript
   // Check mock setup in setup.js
   console.log('Mocks loaded:', jest.isMockFunction(fetch));
   ```

### Test Debugging Commands

```bash
# Run tests with detailed output
npx jest --verbose --no-coverage

# Run specific test with debugging
npx jest --testNamePattern="should validate gesture" --verbose

# Run tests in debug mode
node --inspect-brk node_modules/.bin/jest --runInBand

# Check test coverage
npx jest --coverage --coverageDirectory=coverage/integration
```

## 📊 Test Results and Reporting

### Test Output

```
🚀 Starting OpenAI Gesture Validation Integration Tests

📋 Running Server Integration Tests
   Tests OpenAI Vision service integration with server
   Path: /path/to/server/test/integration

✅ Server Integration Tests passed

📋 Running Client Integration Tests
   Tests React Native client integration with validation service
   Path: /path/to/app/test/integration

✅ Client Integration Tests passed

📋 Running End-to-End Tests
   Tests complete flow from app to server and back
   Path: /path/to/integration/test

✅ End-to-End Tests passed

🎉 All OpenAI integration tests passed!
⏱️  Total duration: 45s

📊 Test Summary:
   ✅ Server Integration Tests
   ✅ Client Integration Tests
   ✅ End-to-End Tests

🎯 OpenAI Gesture Validation system is fully integrated and tested!
```

### Coverage Reporting

```bash
# Generate coverage report
npx jest --coverage --coverageDirectory=coverage/openai-integration

# View coverage in browser
open coverage/openai-integration/lcov-report/index.html
```

## 🔄 CI/CD Integration

### GitHub Actions Example

```yaml
name: OpenAI Integration Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: |
          npm ci
          cd server && npm ci
          cd ../app && npm ci
      - name: Run OpenAI integration tests
        run: node integration/openai-test-runner.js
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

## 🎯 Best Practices

### Writing New Integration Tests

1. **Use Descriptive Test Names**
   ```javascript
   it('should validate gesture through complete pipeline', async () => {
     // Test implementation
   });
   ```

2. **Mock External Dependencies**
   ```javascript
   jest.mock('openai', () => ({
     // Mock implementation
   }));
   ```

3. **Test Error Scenarios**
   ```javascript
   it('should handle API failures gracefully', async () => {
     mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API Error'));
     // Test error handling
   });
   ```

4. **Verify Data Integrity**
   ```javascript
   expect(result.gesture).toBe('expected_gesture');
   expect(result.confidence).toBeGreaterThan(0.8);
   ```

5. **Clean Up After Tests**
   ```javascript
   afterEach(() => {
     jest.clearAllMocks();
   });
   ```

## 📞 Support

For questions about the OpenAI integration tests:

1. Check this README first
2. Review the test files for examples
3. Check existing issues in the repository
4. Create a new issue with detailed error logs

## 🎉 Success Criteria

The OpenAI Gesture Validation system is considered fully tested when:

- ✅ All integration tests pass
- ✅ Test coverage > 90% for new code
- ✅ No critical security vulnerabilities
- ✅ Performance benchmarks met
- ✅ Error handling verified
- ✅ Documentation complete

---

**Happy Testing! 🧪✨**</content>
</xai:function_call">Now let me create a final summary of all the integration tests I've created for the OpenAI gesture validation system.