# User Stories and Screen Flows

This document outlines the main user stories for Amy's Echo and how the screens in `app/src/screens` connect to fulfil them. Each section highlights an existing workflow in the current codebase.

Der zentrale Navigationsrahmen besteht aus der Kamera → Verstehen → Lernen-Schleife. Die gleichnamigen Tabs sind die einzigen Einträge der unteren Navigation; alle weiteren Bereiche (Betreuer, Profile, Admin, Hilfe) werden über `WorkflowSupportLinks` oder kontextuelle Aktionen geöffnet.

## 1. Onboarding & Profile Creation (HIP&nbsp;1)
- **Story**: As a caregiver, I want to set up the profile and preferences for Amy’s Echo the first time we open the app.
- **Flow**:
  1. Launching the app shows the four-step **Onboarding** wizard (Name → Zugänglichkeit → Einverständnis → Vokabular).
  2. Jede Stufe bestätigt Amy’s Echo per Emoji und erklärt, wie sich die Auswahl auf die Erfahrung des Kindes auswirkt.
  3. Nach Abschluss wird das Profil gespeichert und die App navigiert zur **ProfileManager**- bzw. **Tutorial**-Sequenz.

## 2. Selecting a Profile
- **Story**: As Amy or her caregiver, I want to choose who is using the app.
- **Flow**:
  1. From **ProfileManager** oder **ProfileSelect** ein bestehendes Profil auswählen.
  2. Die barrierefreien Einstellungen werden geladen und die App landet im Tab **Kamera** (Recognition).
  3. Weitere Optionen wie Betreuerbereich, Einstellungen oder Admin werden über die `WorkflowSupportLinks` nach dem Sicherheitsgate geöffnet.

## 3. Amy Communicates a Sign
- **Story**: As Amy, I want my gesture to be recognised quickly so I can express myself.
- **Flow**:
  1. **Recognition** opens with the camera active.
  2. When a sign is detected, the matching symbol and audio are shown.
  3. Wenn die Sicherheit gering ist, öffnet ein Tipp auf **Hilfe** das Korrekturpanel direkt in **Recognition**.

## 4. Caregiver Fixes a Misunderstanding (HIP&nbsp;3)
- **Story**: As a caregiver, I want to correct the app when it guesses wrong.
- **Flow**:
  1. In **Recognition** öffnet der Button **Hilfe** das Korrekturpanel mit vier Symbolvorschlägen.
  2. Die Auswahl des richtigen Symbols protokolliert eine Korrektur für spätere Trainings.

## 5. Caregiver Teaches a New Sign (HIP&nbsp;2)
- **Story**: As a caregiver, I want to record samples so the app learns a new gesture.
- **Flow**:
  1. Im Tab **Lernen** führt jede Karte über „Jetzt aufnehmen“ direkt zum **Recording**- bzw. **Training**-Flow.
  2. Der Flow zeichnet fünf Beispiele auf und speichert sie als Trainingsdaten.
  3. Nach Abschluss kehrt die App zum Tab **Lernen** zurück; über `WorkflowSupportLinks` gelangt man bei Bedarf in den Admin- oder Betreuerbereich.

## 6. Proactive Maintenance (HIP&nbsp;4)
- **Story**: As Amy's gestures drift over time, I want the app to gently ask for practice when accuracy drops.
- **Flow**:
  1. If a gesture's health score is low, a non-blocking banner appears in **Learning**.
  2. Tapping **Üben** (Practice) navigates directly to the **Training** flow.

## 7. Reviewing Progress
- **Story**: As a caregiver, I want to see analytics about Amy's learning progress.
- **Flow**:
  1. Über die `WorkflowSupportLinks` (z. B. auf **Kamera**, **Verstehen** oder **Lernen**) den Admin- oder Dashboard-Bereich nach dem Sicherheitsgate öffnen.
  2. Analytics are loaded from local storage and uploaded to the server when online.

## Screen Linking Overview
- `RootNavigator` definiert den Stack mit **Hero**, dem drei-Tab-Navigator (`Kamera`, `Verstehen`, `Lernen`) und allen sekundären Bereichen wie **Parent**, **Admin**, **ProfileManager** oder **Help**.
- `WorkflowStageHeader` stellt auf den Tabs das passende Wording sowie Navigation zum vorigen/nächsten Schritt der Schleife bereit.
- `WorkflowSupportLinks` sammelt Betreuer-, Einstellungs- und Hilfseinträge und führt über das Parental-Gate zu **Parent**, **ProfileManager**, **Admin** oder **Help**.
