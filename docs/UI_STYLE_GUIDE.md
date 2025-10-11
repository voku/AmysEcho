# Amy's Echo UI Style Guide

**Purpose**: Provide LLM-friendly guidelines for building a calm, clear interface that serves non-verbal children and their caregivers.

This guide is a living document. Please update it with any new patterns or components.

## 1. Design Principles

*   **Calm over Speed:** Animations and transitions should be gentle and predictable.
*   **Warm over Sterile:** Use soft colors, rounded corners, and friendly illustrations.
*   **Clarity over Density:** Every screen should have a single, clear purpose.
*   **Guidance over Error:** Failures should lead to gentle recovery paths, not technical errors.
*   **Amy First:** Reinforce the See → Think → Speak/Show → Confirm → Learn loop and surface the six commitments wherever we teach workflows.

## 2. General Style

*   **Corners:** Rounded elements should feel friendly. Default radius is `8px`, with hero panels using `16px` or `20px`.
*   **Shadows:** Use soft shadows (opacity ≤ 0.18) to lift interactive elements without overwhelming the calm UI.
*   **Background:** `ScreenBackground` renders a gentle gradient from `#D1FAE5` to `#F0FDFA`. High-contrast mode swaps to pure black.
*   **Text:** Primary copy uses `#0F172A`. Secondary copy uses `#475569`. On dark overlays use the `overlayText` palette values.

## 3. Color Palette

All values originate in `app/src/constants/colors.ts` and are re-exported for components via `COLORS` in `app/src/constants/ui.ts`.

| Color Token            | Hex Code  | Usage                                                           |
| ---------------------- | --------- | --------------------------------------------------------------- |
| **primary**            | `#14B8A6` | Primary actions, hero pills, confirmation badges.               |
| **accent**             | `#EAB308` | Accent CTAs and alternative actions.                            |
| **success**            | `#10B981` | Positive confirmations (e.g. gesture gefunden).                 |
| **warning**            | `#F59E0B` | Encouraging warnings (e.g. Aufnahme braucht Ruhe).              |
| **error**              | `#EF4444` | Critical errors only; soften copy when surfacing.               |
| **backgroundStart**    | `#D1FAE5` | Gradient start in `ScreenBackground`.                           |
| **backgroundEnd**      | `#F0FDFA` | Gradient end in `ScreenBackground`.                             |
| **surface**            | `#FFFFFF` | Cards, hero panels, Amy-First commitment list.                  |
| **surfaceMuted**       | `#F1F5F9` | Secondary panels or inactive states.                            |
| **text**               | `#0F172A` | Primary typography color.                                       |
| **textMuted**          | `#475569` | Secondary body text and helper hints.                           |
| **inverseText**        | `#F8FAFC` | Text on primary buttons or dark overlays.                       |
| **overlaySurface**     | `rgba(255,255,255,0.28)` | Recognition overlay backgrounds.               |
| **overlaySurfaceMuted** | `rgba(255,255,255,0.18)` | Subtle overlay cards or inactive overlay panels. |
| **overlayBorder**      | `rgba(255,255,255,0.35)` | Divider lines and outlines on overlays.         |
| **overlayBadgeBackground** | `rgba(255,255,255,0.85)` | Active overlay badges (timeline + chips). |
| **overlayBadgeText**   | `#0F172A` | Text/icon color on overlay badges.                           |
| **overlayText**        | `#F9FAFB` | Primary text rendered over camera overlays.                  |
| **overlayTextMuted**   | `#E2E8F0` | Secondary copy on overlays (e.g. hints).                     |
| **highContrastBackground** | `#000000` | Background when high-contrast mode enabled.          |
| **highContrastText**   | `#FFFFFF` | Foreground text/icons in high-contrast mode.                    |

## 4. Typography

*   **Base Font Size:** `16pt`
*   **Large Text Mode:** `20pt`
*   **Font Family:** System default (San Francisco on iOS, Roboto on Android).

All text components must respect the `largeText` setting from the `useAccessibility` context.

## 5. Layout & Spacing

We use an 8-point grid system for spacing and layout. This means that all margins, paddings, and dimensions should be multiples of 8.

*   **Standard Padding:** `16px`
*   **Component Spacing:** `24px`

Layouts should be center-aligned when possible to create a sense of balance and calm.

## 6. Components

Reusable components are located in `app/src/components/`. They should be built with accessibility and the style guide in mind.

### AmyLoopTimeline

The `AmyLoopTimeline` component visualises the mission-critical communication loop: *Sehen → Denken → Sprechen/Zeigen → Bestätigen → Lernen*. Use it whenever a screen guides the caregiver or child through that flow (hero, onboarding, training, recognition).

```tsx
<AmyLoopTimeline activeStage="see" />
<AmyLoopTimeline activeStage="confirm" compact hideDescriptions mode="overlay" />
```

*   **Active Stage:** Highlights with `COLORS.primary` to reinforce the current focus.
*   **Compact Variant:** Use `compact hideDescriptions` inside tight overlays (e.g. recognition overlay).
*   **Accessibility:** The component exposes `list` semantics and honours the global accessibility settings.

### AmyFirstCommitments

`AmyFirstCommitments` lists the six Amy-First promises (No interruption, confusion, delay, failure, judgment, compromise). Place it inside onboarding, hero, or caregiver education flows to remind collaborators of the mission.

```tsx
<AmyFirstCommitments />
```

* Wrap it inside padded containers; it already includes soft borders and badges.
* The component reacts to large-text and high-contrast modes out of the box.

### SymbolButton

The `SymbolButton` is a primary component for interaction. It displays an emoji and a label.

**StyleSheet Example:**

```typescript
const styles = StyleSheet.create({
  button: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  emoji: {
    fontSize: 48,
  },
  label: {
    fontSize: 16,
    color: '#333333',
    marginTop: 8,
  },
});
```

### Correction Panel

The `CorrectionPanel` is a 2x2 grid of large, tappable choices for when the app is unsure about a gesture.

**StyleSheet Example:**

```typescript
const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  gridItem: {
    width: '45%',
    margin: '2.5%',
    aspectRatio: 1, // Make it a square
  },
});
```

## 7. Animations & Feedback

Animations should be gentle and meaningful. We use the `Animated` API from React Native.

*   **Fade-in/Fade-out:** Use a duration of `300ms` with an `Easing.inOut(Easing.ease)` function.
*   **Pulse Effect:** For successful recognition, a gentle pulse animation can be used. The scale should not exceed `1.05`.

## 8. Interaction Strings

The language used in the app should be simple, encouraging, and always in German.

*   **Listening:** "Ich höre zu…"
*   **Success:** "Super! Das ist [Geste]."
*   **Low Confidence:** "Ich bin nicht ganz sicher. Meintest du?"
*   **Encouragement:** "Das war ein guter Versuch! Probier es noch einmal."

## 9. Accessibility & Offline Resilience

*   Always honor `useAccessibility` context for `largeText` and `highContrast`.
*   Provide accessible labels for all touchables and media.
*   UI must remain fully functional offline; never block on network.

## 10. Code & File Conventions

*   Use TypeScript (strict) and React Native functional components.
*   Keep styles near components; export shared constants from `app/src/constants/`.
*   Name files and components with PascalCase; use camelCase for variables and style keys.
