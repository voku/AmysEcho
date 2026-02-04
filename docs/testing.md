# Testing Guide

<!-- Generated: 2026-02-04 21:00:00 UTC -->

## Overview

Amy's Echo uses colocated tests for webapp and centralized tests for server. Tests run via Vitest (webapp/integration) and Jest+Pytest (server).

| Component   | Framework      | Pattern                          |
|-------------|----------------|----------------------------------|
| Webapp      | Vitest         | Colocated (`*.test.ts(x)`)       |
| Server      | Jest + Pytest  | Centralized in `server/test/`    |
| Integration | Vitest         | Centralized in `integration/test/` |

## Test Types

### Unit Tests
- **Webapp components**: `webapp/src/components/TrainingRecorder.test.tsx`
- **Webapp services**: `webapp/src/services/profileRegistry.test.ts`
- **Gesture detection**: `webapp/src/gesture/core/GestureDetector.test.ts`
- **Server auth**: `server/test/auth.test.ts`
- **Server bundles**: `server/test/trainingBundles.test.ts`

### Python Tests
- **ML training**: `server/test/test_train_mlp_balanced.py`

### Integration Tests
- **Training flow**: `integration/test/training-flow.test.ts`

### App-Level Tests
- **Main app**: `webapp/src/App.test.tsx`

## Running Tests

```bash
# Webapp tests (Vitest)
npm test --prefix webapp

# Server tests (Jest + Pytest)
npm test --prefix server

# Integration tests (Vitest)
npm test --prefix integration

# All tests
npm test --prefix webapp && npm test --prefix server && npm test --prefix integration
```

## Configuration Files

| Component   | Config                                              |
|-------------|-----------------------------------------------------|
| Webapp      | `webapp/vite.config.ts`, `webapp/src/setupTests.ts` |
| Server      | `server/jest.config.js`, `server/pyproject.toml`    |
| Integration | `integration/vite.config.ts`                        |

## Test Rules

1. **Never skip existing tests** - update them when behavior changes
2. **Mock only boundaries** - network and system boundaries only
3. **All tests must pass** - before considering work complete
4. **Write tests first** - TDD approach for new functionality

## Reference

- [TESTING_STRATEGY.md](testing/TESTING_STRATEGY.md) - Comprehensive testing strategy
- [REAL_WORLD_VALIDATION_GUIDE.md](testing/REAL_WORLD_VALIDATION_GUIDE.md) - Manual testing procedures
