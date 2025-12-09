# Building and Testing Amy's Echo

This document outlines the process for building and testing the Amy's Echo web application.

## Quick Verification

To verify your setup is working correctly, run the automated verification script from the repository root:

```bash
./scripts/full-check.sh
```

This script checks dependencies, runs all tests (webapp, server, and integration), and validates the training pipeline. It's the fastest way to confirm everything is working.

## Building the Webapp

The application is built using Vite. To build the webapp, run the following command from the repository root:

```bash
npm run build --prefix webapp
```

The production build is output to `webapp/dist/` and can be deployed to any static hosting service.

### Development Server

To run the development server:

```bash
npm run dev --prefix webapp
```

This starts the dev server at http://localhost:5173 with hot module replacement.

## Testing the Webapp

The application has a suite of tests that can be run to verify the core logic. To run the tests, use the following command from the repository root:

```bash
npm test --prefix webapp
```

If all tests pass, you should see a success message in the console. This indicates that the core functionality of the application is working as expected.

## Testing the Server

The backend relies on both Jest (TypeScript) and Pytest (Python). Make sure Node.js 18 or newer is installed so the compiled server bundle is available to the Python suite. Before running the Python tests, compile the TypeScript sources so `dist/server.js` and helper modules exist:

```bash
npm run build --prefix server
```

Running `npm test --prefix server` automatically builds the server before invoking Pytest, so the manual build step is only necessary when executing `npm run test:py --prefix server` directly.

## Running the Server and Webapp

To exercise the full training and recognition flow, start both the Node server and the webapp from the repository root:

```bash
# build and launch the backend on port 5000
npm run build --prefix server
npm start --prefix server

# in another terminal, start the webapp
VITE_API_URL=http://localhost:5000 npm run dev --prefix webapp
```

The server defaults to port `5000`. The webapp connects to the configured API URL.

## Integration Tests

Integration tests verify that the Node server and webapp API clients work together correctly. From the repository root run:

```bash
npm test --prefix integration
```

The tests will build the server and exercise key endpoints. They are also executed by `./scripts/full-check.sh`.

## Production Deployment

The webapp can be deployed to any static hosting service:

1. Build the production bundle:
   ```bash
   npm run build --prefix webapp
   ```
2. Deploy the contents of `webapp/dist/` to your hosting provider.

### Environment Configuration

Set `VITE_API_URL` at build time to configure the API endpoint:

```bash
VITE_API_URL=https://api.example.com npm run build --prefix webapp
```
