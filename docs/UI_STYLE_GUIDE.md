# Amy's Echo UI Style Guide

**Purpose**: Provide LLM-friendly guidelines for building a calm, clear interface that serves non-verbal children and their caregivers.

## 1. Design Principles
- Calm > Speed; Warm > Sterile; Clarity > Density; Guidance > Error.
- Every screen performs one task with large touch targets and generous spacing.
- Maintain trust: failures must surface gentle recovery paths instead of technical errors.

## 2. General Style
- Rounded corners (~8 pt) and subtle shadows keep surfaces soft.
- Default background uses a pastel gradient `#EFF6FF→#F3F4F6`.
- Text color `#333`; muted text `#666`.
- Emojis and gentle illustrations add warmth and clarity.

## 3. Color Palette
- **Primary Accent**: calm blue `#3B82F6` for active elements.
- **Secondary Accent**: gray `#6B7280` for inactive icons.
- **Vocabulary Pastels**: `#AEDFF7` (drink), `#F7C5A8` (eat), `#A8F7A8` (play).
- **High Contrast Mode**: background `#000`, text `#fff`.
- Maintain at least 4.5:1 contrast for text.

## 4. Typography
- Base size: `16`pt; large-text mode: `20`pt.
- All interactive text must have accessible labels and reflect large/high-contrast toggles.

## 5. Layout & Spacing
- Use React Native `StyleSheet` with flexbox.
- Follow an 8‑pt spacing scale; keep layouts center‑aligned where possible.
- Camera view on recognition screen fills width with rounded corners.

## 6. Components
- **Buttons**: `Pressable` with `accessibilityRole="button"` and clear labels.
- **SymbolButton**: shows emoji + word; style adapts to accessibility settings.
- **Correction Panel**: 2x2 grid of large tappable choices.
- Reusable components live in `app/src/components/` and use PascalCase names.

## 7. Animations & Feedback
- Use React Native Animated API for gentle fades or pulse effects.
- Success: large emoji animates in with soft vibration.
- Failure: show a calm `Help Me` button; never abrupt changes.

## 8. Interaction Strings
- Listening state text: "I'm listening…"
- Low-confidence state: show `Help Me` button.
- Avoid exposing technical errors to Amy.

## 9. Accessibility & Offline Resilience
- Always honor `useAccessibility` context for `largeText` and `highContrast`.
- Provide accessible labels for all touchables and media.
- UI must remain fully functional offline; never block on network.

## 10. Code & File Conventions
- Use TypeScript (strict) and React Native functional components.
- Keep styles near components; export shared constants from `app/src/constants/`.
- Name files and components with PascalCase; use camelCase for variables and style keys.
