# Identity Map

## Account identity (Konto)

Primary touchpoints:

- `webapp/src/hooks/useApiConfig.tsx`
- `webapp/src/components/LoginScreen.tsx`
- `webapp/src/components/UserSettings.tsx`
- `server/src/middleware/auth.ts`

Responsibilities:

- register/login/logout
- token persistence and refresh
- password/account lifecycle
- token validation and `401` responses at API boundaries

## Profile identity (Kind-Profil)

Primary touchpoints:

- `webapp/src/services/profileRegistry.ts`
- `webapp/src/hooks/useAppState.tsx`
- `webapp/src/hooks/useTrainingUploader.ts`
- `webapp/src/context/SymbolStore.tsx`
- `server/src/utils/profileAuthorization.ts`
- `server/src/routes/trainingBundleRoute.ts`

Responsibilities:

- active profile selection
- profile-scoped caches
- training/upload scope
- personalization context
- profile ownership checks and caregiver access validation (`403`/`404` paths)
- `X-Profile-Id` header validation for profile-scoped upload/training operations
