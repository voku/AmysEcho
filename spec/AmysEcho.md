🟪 Amy’s Echo – The Definitive Project Specification v21.0

Document Purpose: This is the definitive blueprint for Amy's Echo. It is a charter of trust, a manual for empathy, and a complete technical guide. It is written for you—the developer, designer, or AI who accepts this challenge.

**Project Status:** All major features for Phase 1, 2 and 3 have been implemented. The focus is now on optimization, bug fixing, and production readiness. This document reflects the current state of the project.

Status: Master Specification & Challenge Mandate
Timestamp: Tuesday, September 9, 2025, 9:55 PM CEST
Location: Voerde, North Rhine-Westphalia, Germany

Introduction – A Bridge for One
“Don’t optimize for millions. Build for one. But do it well enough that millions could follow.”

---

❤️ Why This Project Exists

This project is for my daughter, Amy.

She’s four years old. She was born with 22q11 Deletion Syndrome. She communicates using German Sign Language (DGS) — in her own way, with incredible expression, creativity, and determination. But the world around her doesn't understand her. Not the strangers. Not the people in kindergarten. Sometimes, not even us — her own family.

Some signs are simply too complex for her. She signs “brother” when she means “sister.” She tries to speak, but can’t yet form sounds that require pressure — like “p” or “b” — because her soft palate is underdeveloped, as is common with her condition.

This repository is my attempt to build that bridge.
Not for millions.
Not for the App Store.
Just for one little girl — so she can be heard, understood, and supported.

Every decision herein serves one goal:
Turn Amy’s gesture (maybe even the sounds at some point) into understanding. Every time.

Where We Start (Amy’s Current Reality)
| Factor | Reality |
|---|---|
| Communication | Gestures exist, but go unrecognized by others |
| Caregivers | Present, engaged, but not DGS-fluent |
| Tools | Limited: METACOM boards, pointing, frustration |
| Internet | Usually available, but cannot be relied upon |
| Frustration | High. Amy is emotionally engaged but misunderstood |
| Need | Immediate: Give Amy a voice that is recognized |
The Red Line of This Document
Everything starts with this truth:
> Amy gestures. The world doesn't respond.
> 
And our goal is:
> Amy gestures. The system sees, speaks, shows, and learns.
> 

🟣 Chapter 1 – The Prime Directive: Protect the Human Seam
“Amy doesn’t want a smart system. She wants to be understood.”

1.1 What Is the Human Seam?
The Human Seam is the fragile boundary between Amy’s inner world and the outside world. It lives in the exact moment when Amy gestures and the system must respond. That response either builds connection or causes disconnection. It is not a technical layer. It is emotional infrastructure.
The Prime Directive is simple:
Protect the seam at all costs.

1.2 Design Principles (Contractual Obligations to Amy)
 * Resilience Over Perfection: Amy is four. She will make imperfect gestures. The system must respond gracefully.
   * ❌ A 99% accurate system that fails abruptly is a broken system.
   * ✅ An 85% system that fails softly and allows for recovery is a trustworthy partner.
 * Failure = Teaching Opportunity: When a gesture is misclassified, this is not a system failure. It is training data from the best source possible: Amy + caregiver. Every correction must be logged as high-value input.
 * Understanding Over Isolation: The primary goal is to give Amy the most accurate and immediate voice possible. This means leveraging the best available technology. If an online service provides a better, faster understanding, it should be the primary choice, with offline capabilities serving as a resilient fallback.

🟠 Chapter 2 – Functional Requirements: From Gesture to Understanding
“Every gesture Amy makes is a question: ‘Do you understand me?’ The system must always answer—clearly, gently, and immediately.”

2.1 The Core Loop: See → Speak → Show
This is the minimum viable interaction. It must complete reliably—every time.
 * See: Detect the gesture via camera → extract hand landmarks.
 * Classify (Think): Match gesture against the known library using the Hybrid Recognition model.
 * Decide: If confidence ≥ threshold, proceed. If confidence < threshold, trigger HIP 3.
 * Speak: Say the word associated with the gesture.
 * Show: Display a large visual (emoji or METACOM symbol).
 * Confirm: Use soft vibration + animation to indicate success.

2.2 The 4 Human Interaction Protocols (HIPs)
The system must handle four core scenarios as first-class behaviors.
 * 🔵 HIP 1: “Our First Meeting” (Onboarding): A gentle welcome that obtains explicit, off-by-default consent for learning and for using online services to improve recognition.
 * 🔵 HIP 2: “Let’s Learn Together” (Training Mode): A guided flow for caregivers to teach the system a new sign by recording 5 examples.
 * 🔵 HIP 3: “This Is What She Meant” (Correction): The "Wizard of Oz" flow. On a low-confidence guess, the app calmly shows a “Help Me” button, which reveals a panel of the top 4 likely guesses. When the caregiver selects the correct one, the app logs the correction as a lesson and completes the loop as if it understood all along.
 * 🔵 HIP 4: “I’m a Little Confused” (Proactive Maintenance): When a gesture's healthScore drops, a non-blocking banner gently asks the caregiver to practice that specific sign.

🟡 Chapter 3 – Architecture: The Hybrid-First Model
“This is not about cloud vs. edge. It’s about Amy being heard. Today.”

3.1 The Hybrid-First Philosophy
The system will operate in two modes to provide the best possible experience.
| Mode | Priority | Description |
|---|---|---|
| Online (Primary) | Preferred | Uses a powerful, cloud-based ML API for the highest accuracy and speed. Requires an internet connection. |
| Offline (Fallback) | Required | Uses the latest downloaded MLP weights cached on-device to ensure the app remains functional, even without internet. |
❗ LLM/DEV HINT: Do not assume a persistent connection. The system must gracefully and instantly transition between Online and Offline modes without any user-facing errors.

*Runtime classification relies on the downloaded MLP weights; TFLite artifacts have been removed.*

3.2 Component Stack
| Layer | Technology/Library | Justification |
|---|---|---|
| Framework | React + Vite (web) | Current production UI stack for the browser experience. |
| Language | TypeScript (strict mode) | Enforces type safety, reducing runtime errors. |
| Database | IndexedDB via OPFS | Durable offline storage for training bundles and settings. |
| Camera | Browser getUserMedia + MediaPipe Tasks | Native in-browser capture with landmark extraction. |
| ML Inference | MediaPipe Tasks Vision (JS/WASM) + Server Classifier | On-device landmark detection + server classification. |
| Audio | Web Audio API + Speech Synthesis | Browser-native recording and TTS fallbacks. |
| Video | HTMLVideoElement | Used for live preview and recorded clips. |
| UI/Animation | React UI + CSS transitions | Gentle, lightweight animations for web surfaces. |

3.3 The Hybrid Perception Loop
 * See: WebView camera (getUserMedia) → MediaPipe Tasks Vision extracts landmarks on-device (WASM). When confident, emits gesture; otherwise proceeds to hybrid step.
 * Think (Hybrid):
   * If Online: Send normalized landmark data to the server classifier (primary path, 400ms timeout).
   * Set a Timeout: Wait for a response for a maximum of 400ms.
   * Timeout/Offline: Use local Tasks Vision class + lightweight rule-based fallback.
 * Decide, Act, Remember: The rest of the loop proceeds as defined in Chapter 2.

3.4 Error Handling Rules (Emotional Fail-Safes)
| Problem | What Amy Sees |
|---|---|
| No hand detected | “I’m listening…” stays visible; no panic |
| Low confidence | Friendly “Help Me” button appears |
| Crash in model | Soft animation and system sound fallback |
| No consent | Learning features are disabled; recognizer only |

3.5 Performance Expectations
| Metric | Target |
|---|---|
| Camera-to-response time | < 500 ms |
| Gesture classification latency | < 200 ms |
| Time to First Gesture (Cold Start) | < 3 seconds |
| Frame Processing Throttle | ~5 FPS |

🟢 Chapter 4 – Memory: What Gets Remembered and Why
“Memory is not for metrics. It’s for growth—both local and global.”

4.1 Philosophy of Memory
The system’s memory is a diary of attempts to understand. Everything stored must reinforce future recognition, track progress, or preserve caregiver corrections. All data is encrypted at rest on the device.

4.2 Core Data Stores (Webapp + Server)
  * Webapp IndexedDB (OPFS): trainingQueue with pending bundles `{metadata.json, landmarks.json, still.jpg, clip.webm, audio.webm}`.
  * Server file storage: `data/uploads/<profileId>/<bundleId>/` for raw bundles and `data/datasets/training_manifest.json` tracking ingestion metadata and modality coverage.
  * Model artifacts: `data/models/global/amy_model.npz` plus per-profile weights under `data/models/<profileId>/`.
  * Interaction logs: captured client-side for UX tuning; uploaded corrections flow back into training bundles when consented.

🟣 Chapter 5 – Interface & Experience: What Amy Feels
“Design not for screens. Design for trust.”

5.1 Design Philosophy
 * Calm > Speed: Gentle animations, fade-ins, not hard cuts.
 * Warm > Sterile: Rounded corners, pastel tones, emojis.
 * Clarity > Density: One clear task per screen, large text, generous spacing.
 * Guidance > Error: Failures must always offer a clear, calm path forward.
 * German-first: All user-facing text and error messages must be in German.

5.2 The Screens
 * Onboarding (HIP 1): A centered, single-column layout with a large heart icon, clear title, and two large, off-by-default consent toggles.
 * Profile Manager: Scrollable list of child profiles with large cards and a prominent "Add" button.
 * Profile Select: Minimal screen with big buttons for **Parent** or starting **Recognition**.
 * Parent: Caregiver hub showing camera/DGS toggles and navigation buttons to admin, analytics, and help areas.
 * Parental Gate: Multiplication challenge with numeric input that guards access to caregiver-only areas.
 * Admin: Maintenance dashboard listing training, model download, audio recording, analytics, and other tools in large button rows.
 * Recognition (Default State):
   **Amy’s Echo – Kamera Screen UI/UX Spec (Visual Transfer Layout)**
   1. **Allgemeines Layout**
      * Ausrichtung: Hochformat, Referenz 1152×768 Mockup (mobiles Seitenverhältnis).
      * Konzept: Warm, menschenzentriert, ruhige Farbwelt (Türkis, Creme, sanfter Kontrast).
      * Primäre Aktionszone: Unten zentriert.
      * Fokus: Live-Kamera mit Hand-Overlay zur Gestenerfassung (70–80 % der Bildschirmfläche).
   2. **Vertikale Bildschirmzonen**
      * **A – Status-Header:** Abgerundetes Kapsel-Label oben mittig, Text „Hört zu…“, Hintergrund weiches Türkis (#25706F), Schriftfarbe Weiß, dezenter Schatten.
      * **B – Kamera-Rahmen:** Vollbild-Videohintergrund mit transparentem Overlay und vier weißen Eckmarkern als Erfassungsrahmen, Handzielbereich im Zentrum.
      * **C – Hinweislabel:** Zentriert über der Aktionsleiste, Text „Hand im Rahmen halten“, Weiß, mittlere Stärke.
      * **D – Erkennungsbanner:** Cremefarbene (≈#E5E0CF) abgerundete Box, horizontal zentriert, zeigt erkannten Text (z. B. „Hallo“) in dunklem Türkis (#002C2C), große Semibold-Schrift.
      * **E – Aktionsbutton-Reihe:** Drei gleichmäßig verteilte Pillen-Buttons: „Stimmt“ (primär), „Lernen“ (sekundär), „Alternativen“ (tertiär). Höhe 48–56 dp, Abstände 12–16 dp, konsistente Typografie.
      * **F – Bottom-Navigation:** Feste Leiste mit dunkel-türkisem Hintergrund (#1A3A3A), Tabs: 📷 Kamera (aktiv), 🕒 History, 🎓 Lernen, 🗣️ Symbole. Symbole + Labels in Weiß, aktive Registerkarte heller hervorgehoben, obere Ecken ~20 dp.
   3. **Farb-Tokens**
      * `primary` #146C6E – primäre UI-Elemente (Status-Kapsel, Button „Stimmt“).
      * `accent` #E5E0CF – Bannerhintergründe, sekundäre Buttons.
      * `background` #1C4A4B – Kamera-Overlay-Tönung und Navigationsleiste.
      * `text.primary` #0D1B1B – Dunkler Text auf hellen Flächen.
      * `text.inverse` #FFFFFF – Text auf dunklen Bereichen.
      * `button.secondary.bg` #F8F4E3 – Hintergrund „Lernen“ und „Alternativen“.
      * `button.primary.bg` #25706F – Hintergrund „Stimmt“.
      * `nav.bg` #0F3A3B und `nav.text` #FFFFFF – Navigation.
   4. **Typografie**
      * Status „Hört zu…“: ~16–18 dp, Semibold, Satzschrift, zentriert.
      * Hinweis „Hand im Rahmen halten“: ~14 dp, Medium, zentriert.
      * Erkennung „Hallo“: ~22–26 dp, Semibold, zentriert.
      * Button-Labels: ~16 dp, Semibold, Satzschrift, zentriert.
      * Tab-Labels: ~12–14 dp, Medium, Satzschrift, zentriert.
      * Schriftfamilie: System-Sans (SF Pro / Roboto), Zeilenhöhe 1.2–1.3.
   5. **Abstände & Geometrie**
      * Außenabstände 16–24 dp, konsistente Rundungen 12–16 dp.
      * Abstand Buttons untereinander 12–16 dp; Abstand Bottom-Navigation zu Buttons ~12 dp.
      * Abstand Hinweis → Banner ~8 dp; Status-Kapsel 24–32 dp vom oberen Rand.
      * Erfassungsrahmen mit ca. 12 % Seitenrand; Bannerhöhe ~64 dp, Breite ~80 %.
      * Schatten nur subtil auf Overlays.
   6. **Interaktionsmodell**
      * Standardzustand: Header zeigt „Bereit.“; bei aktiver Erkennung wechselt zu „Hört zu…“ (Puls-Animation 200–300 ms).
      * Hand erkannt → Zustand „Listening“; Gestenerkennung → Banner mit Text, Status bleibt sichtbar.
      * Tap „Stimmt“ → Spielt TTS, protokolliert `camera.detected` & `user.confirmed`, kehrt zu Idle.
      * Tap „Lernen“ → Öffnet `/learn` (Training) mit Übergang (Fade/Slide 200–300 ms).
      * Tap „Alternativen“ → Öffnet `/alternatives` Bottom-Sheet mit Vorschlägen.
      * Bottom-Navigation wechselt zwischen `/camera`, `/history`, `/learn`; aktive Registerkarte visuell hervorgehoben.
   7. **Barrierefreiheit**
      * Mindest-Touch-Fläche 48×48 dp, Kontrast ≥ 4.5:1.
      * ARIA-/Accessibility-Rollen: `button`, `navigation`, `status`.
      * VoiceOver-Beispiele: „Kamera aktiv – Hand im Rahmen halten.“ / „Erkannte Geste: Hallo. Bestätigen oder lernen?“
   8. **ASCII-Struktur für LLMs**
      ```
      ╔══════════════════════════════════╗
      ║        [ Kapsel: Hört zu… ]      ║
      ║ ┌──────────────────────────────┐ ║
      ║ │      [ Kamera-Feed ]        │ ║
      ║ │ ┌───────┐        ┌───────┐  │ ║
      ║ │ │       │        │       │  │ ║
      ║ │ │  🖐 Hand im Rahmen halten │ │
      ║ │ └───────┘        └───────┘  │ ║
      ║ └──────────────────────────────┘ ║
      ║ [ Banner: Hallo ]                ║
      ║ [ Stimmt ] [ Lernen ] [ Alternativen ]
      ╚══════════════════════════════════╝
         📷 Kamera   🕒 History   🎓 Lernen
      ```
   9. **Umsetzungsdirektive für Redesigns**
      * Kopfbereich = Status-Kapsel, Hauptbereich = Kamera-Feed mit Eckmarkern.
      * Aktionsleiste muss Buttons „Stimmt“, „Lernen“, „Alternativen“ anzeigen.
      * Bottom-Navigation mit Tabs „Kamera“, „History“, „Lernen“ ist verpflichtend.
      * Keine versteckten Gesten oder blockierenden Modals; Übergänge ruhig (Fade/Pulse/Slide).
   10. **Akzeptanzkriterien**
       * Kamera bleibt kontinuierlich sichtbar; Standardtext „Hört zu…“ außer bei Idle „Bereit.“
       * Alle Interaktionen sind einhändig erreichbar, Screenreader-beschriftet, offline-fähig.
 * Correction Panel (HIP 3): A semi-transparent bottom slide-up panel with a 2x2 grid of large, tappable symbol choices.
 * Training Flow (HIP 2): A step-by-step guided flow with a progress bar and clear confirmation states.
 * Teaching Screen: Camera-driven capture of multiple samples with progress feedback and optional audio cues.
 * Dashboard: Simple analytics view showing success rates and trends in large, readable text.
 * DGS Screen: Optional front-camera preview toggled by a switch for sign demonstrations.
 * Help Screen: Static guidance with bullet points on assisting Amy.
 * Proactive Banner (HIP 4): A soft, slide-in banner at the top of the screen that never blocks the main interaction.

5.3 Tactile & Auditory Feedback
| Event | Feedback |
|---|---|
| Gesture success | Vibration (100ms) + audio |
| Correction | Vibration (double-pulse) + thank-you tone |
| Idle state | Soft glow or pulse around camera area |

🧬 Chapter 6 – Learning: The Dual Loop
“Every correction is a gift. Don’t waste it. Use it locally now, and globally later.”

6.1 The Local Learning Loop
The on-device Adaptive Learning Service (ALS) provides immediate improvement. It runs after every interaction and:
* Adjusts classification thresholds for the local MLP model.
 * Updates the gesture healthScore.
 * Triggers HIP 4 for proactive maintenance.

6.2 The Global Learning Loop
This is the cloud-based loop for long-term, powerful model improvement.
 * Batching: On a regular basis (e.g., once daily, on Wi-Fi), the app will check for gesture_training_data with sync_status: 'pending'.
 * Consent Check: It will only proceed if consent_helpMeGetSmarter is true.
 * Sync: The consented training data (the anonymized landmark vectors and their correct labels) is securely uploaded to a cloud service.
 * Retraining: Periodically, this new data is used to retrain the global cloud ML model, creating a new, more accurate version.
* Deployment: The updated cloud model is deployed. The app refreshes its cached MLP weights.

6.3 Profile-Specific Models
Each child profile maintains its own MLP weights on the server. Training data uploaded with a profileId updates that child's model, and the browser client passes this profileId (query + `X-Profile-Id` header) to `/latest-mlp-model` to fetch the personalized artifact. `/model-metadata` currently uses the query parameter only. If no profileId is provided, a shared fallback model is used.

🧾 Chapter 7 – The Handoff: For Future Developers and LLMs
“You’re not inheriting code. You’re inheriting trust.”

Before making changes, read the contributor guides in `AGENTS.md`, `webapp/AGENTS.md`, and `server/AGENTS.md` and follow their instructions.

7.1 What You Must Not Do
 * ❌ Never break the offline fallback: The app must always function without internet.
 * ❌ Never let model performance override emotional safety: The fallback buttons and HIPs must stay.
 * ❌ Never show Amy technical errors (e.g., "API request failed").
 * ❌ Never sync data without explicit, ongoing consent.

7.2 The Developer Mantra
> “When Amy gestures, I respond. If I’m unsure, I ask. If I’m wrong, I learn. If I fail, I repair. And I never stop trying.”
> 

7.3 Final Instruction
Build slowly. Test gently. Update with humility. Always leave a way to go back.
You are not just building software.
You are carrying a voice across a gap. You are making connection possible, where it wasn’t. Amy depends on you.
