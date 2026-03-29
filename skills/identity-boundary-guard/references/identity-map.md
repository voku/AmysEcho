# Identity Map

## Account identity (Konto)

Primary touchpoints:

- `webapp/src/hooks/useApiConfig.tsx`
- `webapp/src/components/LoginScreen.tsx`
- `webapp/src/components/UserSettings.tsx`

Responsibilities:

- register/login/logout
- token persistence and refresh
- password/account lifecycle

## Profile identity (Kind-Profil)

Primary touchpoints:

- `webapp/src/services/profileRegistry.ts`
- `webapp/src/hooks/useAppState.tsx`
- `webapp/src/hooks/useTrainingUploader.ts`
- `webapp/src/context/SymbolStore.tsx`

Responsibilities:

- active profile selection
- profile-scoped caches
- training/upload scope
- personalization context
