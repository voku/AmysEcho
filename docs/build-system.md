<!-- Generated: 2026-02-04 21:00:00 UTC -->

# Build System

Quick reference for building Amy's Echo. See [BUILD_AND_TEST.md](workflows/BUILD_AND_TEST.md) for detailed instructions.

## Overview

| Component   | Stack              | Config                                          | Output           |
|-------------|--------------------|-------------------------------------------------|------------------|
| Webapp      | Vite + TypeScript  | `webapp/vite.config.ts`, `webapp/tsconfig.app.json` | `webapp/dist/`   |
| Server      | Node + Python      | `server/tsconfig.json`, `server/jest.config.js` | `server/dist/`   |
| Integration | Node test runner   | `integration/`                                  | —                |

## Build Workflows

### Full Check (Recommended)

```bash
./scripts/full-check.sh
```

Runs all type checks, lints, tests, and validates the training pipeline.

### Webapp

```bash
npm ci --prefix webapp              # Install dependencies
npm run type-check --prefix webapp  # TypeScript type check
npm run lint --prefix webapp        # ESLint
npm test --prefix webapp            # Vitest tests
npm run build --prefix webapp       # Production build → webapp/dist/
npm run dev --prefix webapp         # Dev server at http://localhost:5173
```

### Server

```bash
npm ci --prefix server                    # Install Node dependencies
pip install -r server/requirements.txt   # Install Python dependencies
npm run type-check --prefix server        # TypeScript type check
npm run build --prefix server             # Compile TS → server/dist/
npm test --prefix server                  # Jest + Pytest
./scripts/server-start.sh                 # Start server
```

### Integration Tests

```bash
npm ci --prefix integration   # Install dependencies
npm test --prefix integration # Run integration tests
```

## Platform Setup

### Requirements

- **Node.js**: 18+ (LTS recommended)
- **Python**: 3.10+
- **npm**: Bundled with Node.js

### Quick Setup

```bash
# Install all dependencies
npm ci --prefix webapp && npm ci --prefix server && npm ci --prefix integration
pip install -r server/requirements.txt

# Verify setup
./scripts/full-check.sh
```

## Reference

### Build Targets

| Target                          | Description                        |
|---------------------------------|------------------------------------|
| `npm run build --prefix webapp` | Production webapp bundle           |
| `npm run build --prefix server` | Compile TypeScript server          |
| `npm run dev --prefix webapp`   | Dev server with HMR (port 5173)    |
| `npm start --prefix server`     | Run compiled server (port 5000)    |

### Environment Variables

| Variable       | Purpose                      | Example                          |
|----------------|------------------------------|----------------------------------|
| `VITE_API_URL` | API endpoint for webapp      | `http://localhost:5000`          |

### Troubleshooting

| Issue                           | Solution                                                   |
|---------------------------------|------------------------------------------------------------|
| `node_modules` missing          | Run `npm ci --prefix <component>`                          |
| Python deps missing             | Run `pip install -r server/requirements.txt`               |
| Type errors                     | Run `npm run type-check --prefix <component>`              |
| Server dist missing             | Run `npm run build --prefix server` before starting        |
| Port 5173 in use                | Kill process or use `VITE_PORT=3000 npm run dev --prefix webapp` |
| Tests fail after changes        | Run `./scripts/full-check.sh` to validate all components   |
