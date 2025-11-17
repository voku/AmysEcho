# DGS Integration CI/CD Guide

This guide documents the continuous integration and deployment pipeline for the German Sign Language integration in Amy's Echo, ensuring reliable and automated testing across multiple environments.

**Project Status:** All major features for the DGS integration have been implemented. The focus is now on optimization, bug fixing, and production readiness. This document reflects the current state of the project and the established CI/CD pipeline.

## Pipeline Overview

The DGS integration uses a comprehensive CI/CD pipeline with multi-stage testing, security validation, and automated deployment:

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Trigger   │    │   Matrix    │    │  Security   │    │ Deployment  │
│   Events    │───►│   Testing   │───►│   Audit     │───►│             │
│             │    │             │    │             │    │             │
│ • Push/PR   │    │ • Node 18/20│    │ • NPM Audit │    │ • Preview    │
│ • Path      │    │ • Python 3.10│   │ • GitLeaks  │    │ • Production │
│   Filters   │    │ • Multi-OS   │    │ • CodeQL    │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

## GitHub Actions Workflow

### Main Pipeline Configuration

**File**: `.github/workflows/dgs-integration.yml`

**Trigger Conditions**:
```yaml
on:
  push:
    branches: [ main, develop ]
    paths:
      - 'app/webview/**'
      - 'server/src/**'
      - 'scripts/**'
      - 'integration/**'
      - 'server/data/**'
  pull_request:
    branches: [ main, develop ]
    paths:
      - 'app/webview/**'
      - 'server/src/**'
      - 'scripts/**'
      - 'integration/**'
      - 'server/data/**'
```

**Path-based triggering** ensures the pipeline only runs when DGS-related files change, optimizing CI resource usage.

### Matrix Testing Strategy

**Multi-Environment Testing**:
```yaml
strategy:
  matrix:
    node-version: [18, 20]
    python-version: ['3.10']
```

**Benefits**:
- **Compatibility Testing**: Ensures DGS integration works across Node.js and Python versions
- **Early Issue Detection**: Catches environment-specific bugs before production
- **Parallel Execution**: Runs tests simultaneously across matrix combinations

### Service Dependencies

**Redis Integration**:
```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - 6379:6379
    options: >-
      --health-cmd "redis-cli ping"
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
```

**Purpose**: Provides Redis for caching and session management during integration tests.

## Test Execution Pipeline

### 1. Environment Setup

**Dependency Installation**:
```bash
# Python dependencies with caching
pip install -r server/requirements.txt

# Node.js dependencies with workspace support
npm ci --prefix app
npm ci --prefix server
npm ci --prefix integration
```

**Caching Strategy**:
- **npm cache**: Speeds up Node.js dependency installation
- **pip cache**: Accelerates Python package installation
- **Test data**: Prepares model files and test assets

### 2. Code Quality Validation

**Type Checking**:
```bash
npm run type-check --prefix app
npm run type-check --prefix server
```

**Linting**:
```bash
npm run lint --prefix app || true
npm run lint --prefix server || true
```

**Note**: Linting failures are non-blocking to allow gradual code quality improvements.

### 3. Build Process

**WebView Bundle Generation**:
```bash
npm run build:webview --prefix app
```

**Purpose**: Creates the gesture detector bundle that includes DGS model integration.

### 4. Test Execution

**Comprehensive Test Suite**:
```bash
npm test --prefix integration
```

**What the suite covers**:
- Boots the production Express server via `npm run build --prefix server`.
- Exercises `/train-model`, `/latest-mlp-model`, `/model-version`, and the
  training bundle upload endpoint end-to-end.
- Waits for the Python trainer to finish and verifies a real `.npz` model can
  be downloaded and decoded.

**Environment Variables**:
```bash
CI: true
NODE_ENV: test
```

### 5. Artifact Collection

**Test Results Upload**:
```yaml
- name: Upload test results
  uses: actions/upload-artifact@v3
  if: always()
  with:
    name: test-results-${{ matrix.node-version }}-${{ matrix.python-version }}
    path: |
      integration/test-output.log
    retention-days: 30
```

**Collected Artifacts**:
- **Integration Logs**: `integration/test-output.log` captures the node/test
  output, including model training progress and endpoint responses.

## Security & Compliance

### Security Audit Job

**Dependency Vulnerability Scanning**:
```yaml
- name: Run security audit
  run: |
    npm audit --audit-level moderate --prefix app
    npm audit --audit-level moderate --prefix server
  continue-on-error: true
```

**Secret Detection**:
```yaml
- name: Check for secrets
  uses: gitleaks/gitleaks-action@v2
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Accessibility Validation

**Dedicated Accessibility Testing**:
The integration layer no longer keeps synthetic accessibility specs. Rely on
the React Native app tests (`npm test --prefix app`) and the manual QA
checklist in `docs/DeviceTesting.md` to verify:

- Screen reader output for gesture feedback text and caregiver status badges
  (VoiceOver/TalkBack announce German strings and confidence values).
- Keyboard or Switch Control navigation for the caregiver upload + model
  deployment flow (tab order reaches "Modell hochladen" and "Training starten"
  buttons, ARIA labels stay in German).
- High-contrast rendering of the "DGS-Video anzeigen" toggle so partially
  sighted caregivers can verify when trainer playback is active.

## Deployment Pipeline

### Preview Deployment

**Pull Request Validation**:
```yaml
deploy-preview:
  runs-on: ubuntu-latest
  needs: [test, security]
  if: github.event_name == 'pull_request'
```

**Build Process**:
```bash
npm run build:webview --prefix app
npm run build --prefix server
```

### Production Deployment

**Trigger Conditions**:
- All tests pass
- Security audit clean
- Accessibility tests pass
- Code review approved
- Merged to main branch

**Deployment Steps**:
1. **Model Training**: Generate production DGS model
2. **Security Validation**: Final security scan
3. **Performance Testing**: Production environment validation
4. **Gradual Rollout**: Feature flags for controlled deployment
5. **Monitoring**: Real-time performance monitoring

## Monitoring & Alerting

### Performance Regression Detection

**Automated Performance Monitoring**:
```bash
# Capture the integration log
npm test --prefix integration | tee integration/test-output.log

# Detect slow training cycles inside the log
rg -n "training job" integration/test-output.log
```

### Notification System

**Slack Integration**:
```yaml
- name: Send notification
  uses: 8398a7/action-slack@v3
  if: failure()
  with:
    status: failure
    text: 'DGS Integration Tests Failed'
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

## Local Development Setup

### Running Tests Locally

**Full Test Suite**:
```bash
# Install dependencies
npm ci --prefix integration

# Run the real server-backed tests
npm test --prefix integration
```

**Debug Mode**:
```bash
# Verbose test output
DEBUG=dgs:* npm test --prefix integration

# Focus on a subset of test names if needed
npm test --prefix integration -- --test-name-pattern "mlp"
```

### CI Simulation

**Local CI Environment**:
```bash
# Set CI environment
export CI=true
export NODE_ENV=test

# Run CI test suite
npm test --prefix integration
```

## Performance Optimization

### Caching Strategies

**Dependency Caching**:
- **npm**: Node.js package cache across runs
- **pip**: Python package cache for faster installs
- **Build Artifacts**: Cache WebView bundles between runs

**Test Optimization**:
- **Parallel Execution**: Matrix testing across multiple runners
- **Selective Testing**: Path-based triggers reduce unnecessary runs
- **Incremental Builds**: Only rebuild changed components

### Resource Management

**Timeout Configuration**:
```yaml
# Test timeouts
timeout-minutes: 10

# Individual step timeouts
- name: Run DGS integration tests
  run: npm test --prefix integration -- --test-timeout=300000
```

## Troubleshooting CI Failures

### Common Issues

#### Test Timeouts
```bash
# Check for slow tests
npm test --prefix integration -- --test-timeout=60000 --test-name-pattern "train"

# Profile test execution
time npm test --prefix integration
```

#### Dependency Conflicts
```bash
# Clear caches and reinstall
npm cache clean --force
rm -rf node_modules
npm ci --prefix integration

# Check Python environment
python --version
pip list | grep -E "(numpy|tensorflow|opencv)"
```

#### Model File Issues
```bash
# Regenerate test model
python scripts/prepare_default_model.py

# Check model file integrity
ls -la server/data/dgs_model.npz
file server/data/dgs_model.npz
```

### Debug Information

**CI Logs Analysis**:
```bash
# View detailed test output
tail -n 200 integration/test-output.log

# Check performance metrics
rg "training job" -n integration/test-output.log
```

**Artifact Download**:
- Test results available as GitHub Actions artifacts
- Coverage reports with detailed metrics
- Performance benchmarks for regression analysis

## Future Enhancements

### Advanced CI Features

#### Performance Baselines
- Historical performance data comparison
- Automated regression detection with alerts
- Performance trend analysis

#### Security Enhancements
- Container security scanning
- Dependency vulnerability tracking
- Automated security patch application

#### Deployment Automation
- Blue-green deployment strategy
- Automated rollback mechanisms
- Multi-environment promotion pipeline

This CI/CD pipeline ensures the DGS integration maintains high quality, security, and performance standards while providing rapid feedback to developers and reliable deployments to production.