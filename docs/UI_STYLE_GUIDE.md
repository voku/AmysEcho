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
*   **Background:** `ScreenBackground` renders a deep teal gradient from `#1C4A4B` to `#0F3A3B`. High-contrast mode swaps to pure black.
*   **Text:** Primary copy uses `#0D1B1B`. Secondary copy uses `#476667`. On dark overlays use the `overlayText` palette values.

## 3. Color Palette

All values originate in `app/src/constants/colors.ts` and are re-exported for components via `COLORS` in `app/src/constants/ui.ts`.

| Color Token            | Hex Code  | Usage                                                           |
| ---------------------- | --------- | --------------------------------------------------------------- |
| **primary**            | `#146C6E` | Primary actions, hero pills, confirmation badges.               |
| **accent**             | `#F8F4E3` | Accent CTAs and alternative actions.                            |
| **success**            | `#4CD964` | Positive confirmations (e.g. gesture gefunden).                 |
| **warning**            | `#F3C969` | Encouraging warnings (e.g. Aufnahme braucht Ruhe).              |
| **error**              | `#D9534F` | Critical errors only; soften copy when surfacing.               |
| **backgroundStart**    | `#1C4A4B` | Gradient start in `ScreenBackground`.                           |
| **backgroundEnd**      | `#0F3A3B` | Gradient end in `ScreenBackground`.                             |
| **surface**            | `#F8F4E3` | Cards, hero panels, Amy-First commitment list.                  |
| **surfaceMuted**       | `#E5E0CF` | Secondary panels or inactive states.                            |
| **text**               | `#0D1B1B` | Primary typography color.                                       |
| **textMuted**          | `#476667` | Secondary body text and helper hints.                           |
| **inverseText**        | `#FFFFFF` | Text on primary buttons or dark overlays.                       |
| **overlaySurface**     | `rgba(248,244,227,0.95)` | Recognition overlay backgrounds.               |
| **overlaySurfaceMuted** | `rgba(229,224,207,0.88)` | Subtle overlay cards or inactive overlay panels. |
| **overlayBorder**      | `rgba(229,224,207,0.45)` | Divider lines and outlines on overlays.         |
| **overlayBadgeBackground** | `rgba(248,244,227,0.9)` | Active overlay badges (timeline + chips). |
| **overlayBadgeText**   | `#0D1B1B` | Text/icon color on overlay badges.                           |
| **overlayText**        | `#FFFFFF` | Primary text rendered over camera overlays.                  |
| **overlayTextMuted**   | `rgba(255,255,255,0.75)` | Secondary copy on overlays (e.g. hints).                     |
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
*   **Mobile Navigation Safe Area:** Ensure main content keeps enough bottom padding so fixed navigation never overlaps key controls on small screens.
*   **Mobile Kamera-Ansicht:** Die Gestenerkennung nutzt auf kleinen Displays eine Vollbild-Kamera (edge-to-edge), damit Hände und Oberkörper frei sichtbar bleiben und Bedienelemente nicht die Mitte überdecken.

Layouts should be center-aligned when possible to create a sense of balance and calm.

## 6. Components

Reusable components are located in `app/src/components/`. They should be built with accessibility and the style guide in mind.

### AmyLoopTimeline

The `AmyLoopTimeline` component visualises the mission-critical communication loop: *Kamera → Verlauf → Lernen*. Verwende es auf erklärenden Flächen wie Hero, Onboarding oder Trainingseinführungen. Das eigentliche Kamera-Overlay verzichtet bewusst auf die Timeline und zeigt nur den Statuschip, damit der Fokus komplett auf Amys Hand und die drei Aktionen bleibt.

```tsx
<AmyLoopTimeline activeStage="Recognition" />
<AmyLoopTimeline activeStage="History" compact hideDescriptions mode="overlay" />
```

*   **Active Stage:** Highlights with `COLORS.primary` to reinforce the current focus.
*   **Compact Variant:** Use `compact hideDescriptions` inside tight Overlays wie Onboarding-Karten.
*   **Accessibility:** The component exposes `list` semantics and honours the global accessibility settings.

### WorkflowStageHeader

`WorkflowStageHeader` bündelt das aktuelle Stadium der Schleife samt Kontexttext in einem ruhigen Block. Seit der Vereinfachung verzichtet die Komponente auf zusätzliche Weiter/Zurück-Aktionen und zeigt stattdessen optional eine kompakte `AmyLoopTimeline`, damit die drei Schritte als visuelle Leitplanke präsent bleiben.

```tsx
<WorkflowStageHeader route="History" tone="dark" />
<WorkflowStageHeader route="Lernen" align="center" showTimeline={false} />
```

*   **Timeline optional:** Über `showTimeline` lässt sich die kompakte Schleifen-Visualisierung je nach Layout ein- oder ausblenden.
*   **Tonvarianten:** `tone="dark"` nutzt die Overlay-Farben für Verlauf/Lernen, `tone="light"` die Kartenfarben.
*   **Ausrichtung:** `align="center"` richtet Badge, Titel und Beschreibung mittig aus – ideal für Hero-Abschnitte oder Modale.

### Kamera-Aktionsbuttons

Im Kamera-Overlay führen drei Buttons („Stimmt“, „Lernen“, „Alternativen“) durch die Schleife. Die Farben kommen aus `colors.ts` (`cameraActionConfirm*`, `cameraActionLearn*`, `cameraActionAlternatives*`). Sie kombinieren warme Töne (#E5E0CF) für Bestätigen mit tiefem Petrol (#25706F, #1C4A4B) für Lernpfade, um das Mockup widerzuspiegeln.

**Lesbarkeit im Kamera-Overlay:** Statuszeilen, Metadaten und Buttons müssen auch bei hellem Kamera-Feed klar bleiben. Verwende dafür dunkle, halbtransparente HUD-Flächen (Glas-Optik), `overlayText`/`inverseText` als Textfarbe und klare Button-Hintergründe mit Schatten, damit die Aktionen auf dem Video jederzeit erkennbar bleiben.

### Vollbild-Gestenkamera (Web)

Die Web-Gestenkamera nutzt ein Vollbild-Layout, damit Hände und Oberkörper komplett sichtbar bleiben und Amy nicht durch Rahmen abgelenkt wird:

* **Statuskapsel oben:** Zeigt „Ich höre zu…“, Initialisierung und Fehler klar und ruhig an, inkl. farbigem Punkt.
* **Profilzeile im HUD:** Kleine, dezente Zeile für Profil und Standardgeste, damit Betreuungspersonen Kontext behalten.
* **Unteres Steuerdock:** Erkennungs-Banner, die drei Hauptaktionen sowie optionales „Kamera starten“, falls die Erkennung pausiert ist.
* **Korrekturfläche:** „Alternativen“ öffnet die Korrektur direkt im Dock, damit Amy im gleichen Fokus bleibt.

### Selbstentdeckungs-Ribbon

Sobald eine Geste sicher erkannt wurde, blendet das Overlay ein zentriertes Ribbon ein:

* **Label:** `Amy's Echo` in Versalien mit `overlayTextMuted`, um den Absender zu markieren.
* **Botschaft:** „Das ist dein Moment der Selbstentdeckung – Amy spiegelt deine Geste gleich als Stimme und Symbol zurück.“
* **Layout:** Abgerundete Karte (`borderRadius: 28`) mit `overlaySurfaceMuted` und zartem Schatten (`shadowOpacity: 0.12`).
* **Statuschip:** Der Hauptchip trägt jetzt das Label „Selbstentdeckung“, damit das Mockup-Narrativ direkt sichtbar wird.

Nutze dieses Muster ausschließlich im Erfolgspfad des Kamera-Overlays. Erklärende Flächen (Hero, Onboarding, Lernen) verwenden weiterhin die `AmyLoopTimeline`.

### Verlauf-Highlight „Selbstentdeckung gesichert“

Der Tab **Verlauf** führt das Selbstentdeckungs-Narrativ fort:

* **Highlight-Karte:** `historyHighlightBackground` + `historyHighlightBorder` bilden einen hellen Frame mit `borderRadius: 28` und großzügigem `padding: spacing['2xl']`.
* **Badge:** Ein runder Chip mit `historyHighlightBadge` und der Aufschrift „Selbstentdeckung gesichert“ macht den gefeierten Moment klar.
* **Text:** Titel in `typography.sizes.title` + `historyHighlightText`, Untertitel in `typography.sizes.body` + `historyHighlightMuted`.
* **Aktionen:** Zwei Buttons – "Zur Kamera" nutzt die Kamera-CTA-Farben (`cameraActionConfirm*`), "Im Lernmodus vertiefen" setzt auf den sekundären Button. Beide Buttons sind mindestens 160 px breit und stehen nebeneinander (flex-wrap).
* **Karten-Narrativ:** Jede Verlaufskarte ergänzt neben dem Vertrauens-Badge eine Folgehandlung („Selbstentdeckung bestätigt“, „Noch unsicher“, „Bitte prüfen“), um klarzumachen, was als nächstes passieren kann.

Der leere Zustand referenziert ebenfalls Selbstentdeckungen („Noch keine Selbstentdeckungen…“) und bleibt damit konsistent mit Kamera und Lernen.

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
