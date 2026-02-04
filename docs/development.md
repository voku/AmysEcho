<!-- Generated: 2026-02-04 21:00:00 UTC -->

# Amy's Echo Development Guide

This guide covers the development environment, code style, and workflows for contributing to Amy's Echo. The codebase is optimized for LLM agents.

## Overview

Amy's Echo is a multimodal communication platform for non-verbal children. Development follows **Amy First** principles—every change must enhance Amy's ability to communicate.

### Environment Requirements

- **Node.js** >= 18.13.0
- **Python** 3.x with numpy, scikit-learn, and dependencies in `server/requirements.txt`
- **Editor**: VS Code recommended

### Quick Setup

```bash
# Webapp
npm ci --prefix webapp

# Server
npm ci --prefix server
pip install -r server/requirements.txt

# Integration tests
npm ci --prefix integration
```

---

## Code Style

### TypeScript Conventions

- **Strict mode** enabled across all TypeScript code
- **Named exports only** in webapp (no default exports)
- **German** for all user-facing UI text
- **English** for developer logs, console output, and internal identifiers

### Test Organization

| Package | Test Location | Pattern |
|---------|---------------|---------|
| Webapp | Colocated with source | `ComponentName.test.tsx` |
| Server | `server/test/` directory | `serviceName.test.ts` |
| Integration | `integration/` directory | End-to-end tests |

### File Examples

**Webapp component** (`webapp/src/components/`):
```
SignLanguageRecorder.tsx      # Component
SignLanguageRecorder.test.tsx # Tests alongside
```

**Webapp hook** (`webapp/src/hooks/`):
```
useTrainingRecorder.ts        # Hook
useTrainingRecorder.test.tsx  # Tests alongside
```

**Server service** (`server/src/services/`):
```
profileRegistry.ts            # Service implementation
# Tests in server/test/profileRegistry.test.ts
```

---

## Common Patterns

### LLM-Optimized Code

This codebase is developed by LLM agents. Prefer standard library APIs over custom abstractions.

**✅ Good: Standard patterns with named constants**
```typescript
// Named constants for Amy-specific thresholds
const STRUGGLING_THRESHOLD = 0.6;
const MIN_ATTEMPTS = 5;

// Standard library patterns
const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
const recent = items.filter(item => item.timestamp > cutoff);
const rate = recent.filter(r => r.success).length / recent.length;

// Filter with business logic
const struggling = gestures.filter(g => {
  const successRate = g.successful / g.total;
  return successRate < STRUGGLING_THRESHOLD && g.total >= MIN_ATTEMPTS;
});
```

**❌ Avoid: Custom wrappers around standard APIs**
```typescript
// Don't do this - adds cognitive load for LLMs
const cutoff = getDaysCutoff(7);
const recent = filterByTimeWindow(items, windowMs);
const rate = calculateSuccessRate(recent);
```

### When to Extract Functions

| Extract? | Condition | Example |
|----------|-----------|---------|
| ✅ Yes | Complex AND reused | `calculateGestureConfidenceWithContext(...)` |
| ✅ Yes | Name provides clarity | `validateProfilePermissions(...)` |
| ❌ No | Simple one-liners | `Date.now() - timestamp` |
| ❌ No | Wrapper around standard API | `getCurrentTimestamp()` |

### Named Constants for Business Logic

```typescript
// Amy-specific thresholds as named constants
private readonly STRUGGLING_SUCCESS_THRESHOLD = 0.6;
private readonly MIN_ATTEMPTS_FOR_STRUGGLING = 5;
private readonly RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
```

### Python Conventions

- **Import sorting**: Standard library → third-party → local (use `isort`)
- **Indentation**: 4 spaces
- **Trailing newline**: Single newline at end of file
- **Shared utilities**: Check `scripts/dgs_common.py` for DGS-related functionality

---

## Workflows

### Development Cycle

1. **Study task** from `docs/planning/TODO.md`
2. **Explore codebase** patterns in similar files
3. **Implement** with tests (TDD approach)
4. **Verify** with type-check + lint + test
5. **Update docs** if behavior changed

### Build Commands

```bash
# Webapp
npm run type-check --prefix webapp
npm run lint --prefix webapp
npm test --prefix webapp
npm run build --prefix webapp

# Server
npm run type-check --prefix server
npm test --prefix server
npm run build --prefix server

# Integration
npm test --prefix integration

# Full check (all packages)
./scripts/full-check.sh
```

### Key File Locations by Task

| Task | Files |
|------|-------|
| Add UI component | `webapp/src/components/NewComponent.tsx` |
| Add custom hook | `webapp/src/hooks/useNewHook.ts` |
| Modify gesture pipeline | `webapp/src/gesture/` |
| Add API endpoint | `server/src/routes/` |
| Add server service | `server/src/services/` |
| Add Python tool | `server/src/amyserver_tools/` |
| Update training logic | `webapp/src/training/` |

---

## Reference

### File Organization

```
webapp/
├── src/
│   ├── components/     # UI components with colocated tests
│   ├── hooks/          # Custom React hooks
│   ├── gesture/        # Gesture recognition pipeline
│   ├── training/       # Training queue and workflows
│   ├── services/       # API clients, external services
│   ├── context/        # React context providers
│   ├── types/          # TypeScript type definitions
│   └── utils/          # Utility functions

server/
├── src/
│   ├── services/       # Backend services
│   ├── routes/         # API route handlers
│   ├── tools/          # TypeScript CLI tools
│   └── amyserver_tools/ # Python training tools
├── test/               # Server tests

integration/            # End-to-end tests
docs/                   # Documentation
scripts/                # Build and utility scripts
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Component | PascalCase | `SignLanguageRecorder.tsx` |
| Hook | camelCase with `use` prefix | `useTrainingRecorder.ts` |
| Service | camelCase with `Service` suffix | `profileRegistry.ts` |
| Test | Source name + `.test` | `useApiConfig.test.tsx` |
| Route | camelCase with `Route` suffix | `trainingBundleRoute.ts` |

### Key Services

**Webapp Services** (`webapp/src/services/`):
- `apiClient.ts` - HTTP client for server communication
- `profileRegistry.ts` - User profile management
- `gestureHistoryService.ts` - Gesture tracking
- `performanceMonitor.ts` - Runtime performance metrics

**Server Services** (`server/src/services/`):
- `authService.ts` - Authentication
- `profileRegistry.ts` - Profile data persistence
- `trainingBundleIngestor.ts` - Training data processing

---

## Additional Resources

- [DEVELOPMENT_WORKFLOW.md](workflows/DEVELOPMENT_WORKFLOW.md) - Detailed Amy First processes
- [TESTING_STRATEGY.md](testing/TESTING_STRATEGY.md) - Comprehensive testing guidelines
- [AGENTS.md](../AGENTS.md) - Full contributor guide with LLM optimization details
- [TODO.md](planning/TODO.md) - Current priorities and implementation status
