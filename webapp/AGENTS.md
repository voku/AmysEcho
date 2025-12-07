# AGENTS.md - Webapp Guidelines

Scope: All files under `webapp/`.

**Project Status:** All major features for the webapp have been implemented. The focus is now on optimization, bug fixing, and production readiness. The `docs/TODO.md` file serves as a living document for ongoing improvements.

## Tech Stack

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite 5
- **Testing**: Vitest + Testing Library + happy-dom
- **Routing**: React Router DOM v6
- **Linting**: ESLint with TypeScript and React plugins
- **State Management**: React hooks and Context API
- **Gesture Recognition**: MediaPipe with custom ML pipeline
- **Storage**: IndexedDB (via browser APIs)

## AI Assistant Workflow

**IMPORTANT**: AI assistants must follow this step-by-step approach:

### 1. Discovery Phase (ALWAYS do this first)
- **Read the `docs/TODO.md` or task description completely** to understand the current priorities.
- **Review the existing documentation** in the `docs/` directory to understand the project's architecture and features.
- **Examine the existing codebase structure** using `find` or `ls` commands.
- **Study similar existing files** - look for patterns, naming conventions, and architectural decisions.
- **Run the test suite** to understand current functionality and ensure nothing is broken.
- **Check dependencies and configuration files** (`package.json`, `tsconfig.json`, etc.)

### 2. Planning Phase (Before any implementation)
- **Create a detailed implementation plan** that explains:
  - Which files need to be created/modified
  - What existing patterns you'll follow
  - How your changes integrate with current architecture
  - What tests need to be added/updated
- **Identify potential breaking changes** and mitigation strategies
- **Plan your testing approach** - don't just implement features, plan how to verify they work

### 3. Implementation Phase
- **Start with tests** when adding new functionality (TDD approach)
- **Make small, incremental changes** - don't implement everything at once
- **Follow existing code patterns exactly** - don't introduce new architectural concepts without justification
- **Test continuously** - run relevant tests after each significant change

### 4. Verification Phase (MANDATORY)
- **Run the full test suite** - all tests must pass
- **Verify type checking** - no TypeScript errors
- **Test the actual functionality** - don't assume it works because tests pass
- **Check for integration issues** - ensure your changes work with existing features

## General Workflow

1. **Study the task**: read `docs/TODO.md`, issue description, or requirements completely.
2. **Explore codebase**: understand the current state and patterns.
3. **Understand existing code**: look at similar files and tests to follow established patterns.
   - Components: `webapp/src/components/*`
   - Hooks: `webapp/src/hooks/*`
   - Gesture code: `webapp/src/gesture/*`
   - Training: `webapp/src/training/*`
   - Services: `webapp/src/services/*`
   - Tests: Colocated with source files (e.g., `utils.test.ts` next to `utils.ts`)
4. **Plan thoroughly** before implementing - explain your approach and get feedback if possible.
5. **Implement** changes in the proper directory. Do not introduce unnecessary abstractions or large mock setups.
6. **Use German for all user-facing text and any error messages that Amy sees in the app.** Developer-facing logs, console output, and internal identifiers can remain in English.
7. **Update the documentation** to reflect your changes. This includes the `docs/` directory and any relevant `README.md` files.

## Commands to Run from Repository Root

All commands should be run with the `--prefix webapp` flag from the repository root:

```bash
# Install dependencies
npm ci --prefix webapp

# Development server (http://localhost:5173)
npm run dev --prefix webapp

# Type checking
npm run type-check --prefix webapp

# Linting
npm run lint --prefix webapp

# Run tests
npm test --prefix webapp

# Build for production
npm run build --prefix webapp

# Preview production build
npm run preview --prefix webapp
```

## Directory Structure

```
webapp/
├── src/
│   ├── components/      # React components
│   ├── hooks/           # Custom React hooks
│   ├── gesture/         # Gesture recognition (copied from app/webview/)
│   ├── training/        # Training bundle creation and upload
│   ├── services/        # API services and external integrations
│   ├── context/         # React Context providers
│   ├── utils/           # Utility functions
│   ├── types/           # TypeScript type definitions
│   ├── telemetry/       # Analytics and monitoring
│   ├── constants/       # Application constants
│   ├── assets/          # Static assets (images, etc.)
│   ├── App.tsx          # Main application component
│   ├── App.css          # Global styles
│   ├── main.tsx         # Application entry point
│   └── model.ts         # Core data models
├── public/              # Static files served as-is
├── index.html           # HTML entry point
├── vite.config.ts       # Vite configuration
├── tsconfig.json        # TypeScript configuration
└── package.json         # Dependencies and scripts
```

## Code Style & Conventions

### React Components
- Use **function components** with hooks (not class components)
- Prefer **named exports** over default exports for consistency
- Colocate tests with components (e.g., `Button.tsx` and `Button.test.tsx`)
- Use TypeScript interfaces for props

```typescript
// Good example
export interface ButtonProps {
  label: string;
  onClick: () => void;
}

export function Button({ label, onClick }: ButtonProps) {
  return <button onClick={onClick}>{label}</button>;
}
```

### State Management
- Use React hooks (`useState`, `useEffect`, `useContext`) for local state
- Use Context API for shared state across components
- Avoid prop drilling - use context when passing props through multiple levels

### Testing
- Write tests alongside source files (same directory)
- Use Vitest + Testing Library for component tests
- Use `happy-dom` for DOM testing (as configured in `vite.config.ts`)
- Mock only external boundaries (API calls, browser APIs)
- Never mock internal application code

```typescript
// Good test example
import { render, screen } from '@testing-library/react';
import { Button } from './Button';

test('renders button with label', () => {
  render(<Button label="Klick mich" onClick={() => {}} />);
  expect(screen.getByText('Klick mich')).toBeInTheDocument();
});
```

### TypeScript
- Enable strict type checking (already configured)
- Define interfaces for all props and data structures
- Avoid `any` type - use `unknown` if type is truly dynamic
- Use type inference where possible

### Imports
- Use absolute imports from `src/` when configured
- Group imports: React/external libraries first, then internal modules
- Keep imports organized and clean

## Environment Configuration

### Required Node Version
- Node.js >= 18.13.0

### Environment Variables
- `VITE_API_URL`: API server URL (Production-Fallback: `https://amysecho.moelleken.org` für das GitHub-Pages-Deployment; Tests fallen auf `http://localhost:5000` zurück)
- Additional variables can be defined in `.env` files (prefixed with `VITE_`)

### Browser Compatibility
- Modern browsers with ES2020+ support
- Camera access required for gesture recognition
- IndexedDB required for offline training queue

## Testing Rules

- **Never skip or comment out existing tests**. Update them when behavior changes.
- **Use mocks sparingly**; only mock network calls or other system boundaries.
- Write tests for new functionality before or alongside implementation.
- Ensure all tests pass before considering work complete.
- Run `npm test --prefix webapp` to execute the test suite.
- Review the generated test coverage report to spot untested paths.

## Webapp-Specific Features

### Gesture Recognition
- Located in `src/gesture/` - copied from `app/webview/`
- Uses MediaPipe for hand landmark detection
- Bridge to replace React Native WebView with browser events
- Stabilization and handedness fallback built-in

### Training System
- **Live Recording**: Capture gestures with browser camera
- **Landmark Extraction**: Automatic MediaPipe detection during recording
- **Bundle Creation**: Generates ZIP with metadata.json, landmarks.json, still.jpg
- **Upload Queue**: IndexedDB-based offline queue with retry logic
- **Job Polling**: Tracks training job status after upload

### Browser Adaptations
- **No SecureStore**: Sensitive data not persisted in browser
- **Optional Haptics**: Uses `navigator.vibrate` when available
- **Camera Permissions**: Requires user permission via browser APIs
- **Download-based Exports**: Media exports as browser downloads

## Common Pitfalls to Avoid

1. **Don't add default exports** - use named exports for consistency
2. **Don't skip type checking** - always run `npm run type-check --prefix webapp`
3. **Don't mock internal code** - only mock external boundaries
4. **Don't ignore linting errors** - fix them before committing
5. **Don't mix German and English in UI** - use German for all user-facing text
6. **Don't modify gesture code without understanding** - it's shared with the mobile app
7. **Don't skip tests** - write tests for new features

## German Language Requirement

**Critical**: All user-facing strings must be in German. This includes:
- UI labels and buttons
- Error messages shown to Amy
- Success notifications
- Form placeholders and help text
- Accessibility labels

Developer-facing content can remain in English:
- Code comments
- Console logs
- Internal variable names
- Test descriptions

## Security & Privacy

- Never commit secrets or API keys
- Store sensitive data only in environment variables (prefixed with `VITE_`)
- Use HTTPS for production deployments
- Validate all user inputs
- Follow CORS best practices when connecting to the server

## Questions AI Assistants Should Ask

Before starting implementation, consider:
- "What similar functionality already exists in the webapp that I can learn from?"
- "Are there existing components or hooks I can reuse?"
- "How does the mobile app (`app/`) handle this feature?"
- "What existing tests can guide my understanding of this area?"
- "Does this change affect the gesture recognition pipeline?"
- "Do I need to update any Context providers or hooks?"

## Integration with Other Components

- **Server**: API calls go to `VITE_API_URL` (configured in environment)
- **Mobile App**: Gesture code in `src/gesture/` mirrors `app/webview/`
- **Training Pipeline**: Bundles uploaded to `/api/v1/dgs/sample-bundles`
- **Documentation**: Keep `webapp/README.md` updated with changes

## Additional Resources

- **Root AGENTS.md**: General repository guidelines and Amy First principles
- **Development Workflow**: See `docs/DEVELOPMENT_WORKFLOW.md`
- **Testing Strategy**: See `docs/TESTING_STRATEGY.md`
- **Current Status**: See `docs/TODO.md`
- **Webapp README**: See `webapp/README.md` for German feature documentation
