# Amy's Echo UI Style Guide

**Purpose**: Provide LLM-friendly guidelines for building a calm, clear interface that serves non-verbal children and their caregivers.

This guide is a living document. Please update it with any new patterns or components.

## 1. Design Principles

*   **Calm over Speed:** Animations and transitions should be gentle and predictable.
*   **Warm over Sterile:** Use soft colors, rounded corners, and friendly illustrations.
*   **Clarity over Density:** Every screen should have a single, clear purpose.
*   **Guidance over Error:** Failures should lead to gentle recovery paths, not technical errors.

## 2. General Style

*   **Corners:** Use a border radius of `8px` for most components to create a soft, friendly look.
*   **Shadows:** Apply subtle shadows to create depth and lift components from the background.
*   **Background:** The default background is a subtle linear gradient from `#EFF6FF` to `#F3F4F6`.
*   **Text:** Default text color is `#333333`. Muted text for secondary information is `#666666`.

## 3. Color Palette

| Color Name          | Hex Code  | Usage                                     |
| ------------------- | --------- | ----------------------------------------- |
| **Primary Accent**  | `#3B82F6` | Active elements, buttons, links.          |
| **Secondary Accent**| `#6B7280` | Inactive icons, borders, secondary text.  |
| **Success**         | `#10B981` | Confirmation messages, success indicators.|
| **Warning**         | `#F59E0B` | Gentle warnings or prompts.               |
| **Error**           | `#EF4444` | (Use sparingly) For critical errors that need attention. |
| **Pastel Drink**    | `#AEDFF7` | Vocabulary category for "drink".        |
| **Pastel Eat**      | `#F7C5A8` | Vocabulary category for "eat".          |
| **Pastel Play**     | `#A8F7A8` | Vocabulary category for "play".         |
| **High Contrast BG**| `#000000` | Background in high-contrast mode.         |
| **High Contrast FG**| `#FFFFFF` | Foreground (text, icons) in high-contrast mode. |

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