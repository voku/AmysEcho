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

## Expo / React Native TypeScript add-ons

Expo ships a curated base config that already wires in React Native defaults. Running `npx expo customize tsconfig.json` will scaffold a file that extends `expo/tsconfig.base`, and you can layer any of the stricter options above on top of it.【f22502†L39-L62】

If you need an alternative starting point (for example when extracting shared packages), the React Native team publishes `@react-native/typescript-config`, which exposes an `extends` target that mirrors the metro bundler expectations. Installing it as a dev dependency and setting `"extends": "@react-native/typescript-config"` gives you React Native–aware lib definitions without Expo-specific extras.【6e7105†L21-L60】

The broader TypeScript community also maintains `@tsconfig/react-native`, a strict base profile with React Native types and modern ECMAScript libs preconfigured. You can chain it under Expo's config or use it directly in supporting packages when you want the same safety net outside of the app shell.【f1a136†L1-L30】

Between these presets you can mix and match the level of strictness you need while keeping compatibility with Expo's toolchain. Start with Expo's default, opt into the React Native base when you are building plain RN code, and lean on the community preset for shared libraries that should still compile cleanly inside Metro.
