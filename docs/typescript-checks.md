# TypeScript Strictness in the App

The app TypeScript configuration now enforces additional compile-time guarantees aimed at Expo / React Native best practices:

- `noUnusedLocals` ensures we do not accumulate dead utilities, keeping the bundle lean and avoiding stale logic paths.
- `noUnusedParameters` surfaces props and service method arguments that drift out of use so we either wire them up or explicitly drop them.
- `noFallthroughCasesInSwitch` guards state machines and reducers from silently running multiple branches, which is especially important in gesture/feedback flows.

To stay green when making changes:

1. Prefer renaming intentionally ignored parameters to `_param` instead of leaving them unused.
2. Remove or integrate dormant properties when extending memoized components or service classes.
3. Keep switch statements exhaustive and add explicit `break`/`return` clauses.

When adding new modules, import types with `import type` to keep the bundler happy and rely on these stricter checks to catch regression in our motion/feedback services.
