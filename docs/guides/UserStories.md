# User Stories and Screen Flows

This document outlines the main user stories for Amy's Echo and how the webapp routes and components connect to fulfil them. Each section highlights an existing workflow in the current codebase.

Der zentrale Navigationsrahmen besteht aus der Kamera → Verlauf → Lernen-Schleife. Die gleichnamigen Tabs sind die einzigen Einträge der unteren Navigation; auf großen Displays erscheint sie als kompaktes Dock, damit der Inhalt im Fokus bleibt. Alle weiteren Bereiche (Familie, Einstellungen, Admin, Hilfe) werden über `WorkflowSupportLinks` oder kontextuelle Aktionen geöffnet.

## 1. Onboarding & Profile Creation (HIP&nbsp;1)
- **Story**: As a caregiver, I want to set up the profile and preferences for Amy’s Echo the first time we open the app.
- **Flow**:
  1. Launching the app shows the two-step **Onboarding** wizard (Willkommen → Name).
  2. Amy’s Echo bestätigt den Abschluss mit Emoji und leitet direkt in den Kamera-Flow weiter.
  3. Nach Abschluss wird das Profil gespeichert und die App navigiert zur **ProfileManager**- bzw. **Tutorial**-Sequenz.

## 2. Selecting a Profile
- **Story**: As Amy or her caregiver, I want to choose who is using the app.
- **Flow**:
  1. From **ProfileManager** oder **ProfileSelect** ein bestehendes Profil auswählen.
  2. Das Profil wird geladen und die App landet im Tab **Kamera** (Recognition).
  3. Weitere Optionen wie Familienbereich, Einstellungen oder Admin werden über die `WorkflowSupportLinks` nach dem Sicherheitsgate geöffnet.
  4. Fortgeschrittene Betreuungstools (vertrauenswürdiges Gerät, Gestengrößen-Toleranz, Erfolgsfeedback, Gestenverlauf) sind in aufklappbaren Abschnitten gebündelt, damit die Profilübersicht jederzeit sichtbar bleibt.

## 3. Amy Communicates a Sign
- **Story**: As Amy, I want my gesture to be recognised quickly so I can express myself.
- **Flow**:
  1. **Recognition** opens with the camera active.
  2. Ein Statuschip signalisiert „Hört zu…“, darunter der Kamera-Rahmen wie im Mockup.
  3. When a sign is detected, the status chip flips to „Selbstentdeckung“, das Ribbon erklärt den Moment der Selbstentdeckung und das passende Symbol sowie die Audioausgabe werden eingeblendet.
  4. Die drei Buttons („Stimmt“, „Lernen“, „Alternativen“) führen unmittelbar zu Verlauf bzw. Lernpfad.
  5. Wenn die Sicherheit gering ist, öffnet ein Tipp auf **Hilfe** das Korrekturpanel direkt in **Recognition**.

## 4. Selbstentdeckungen erneut erleben
- **Story**: As a caregiver, I want to celebrate Amy’s latest self-discovery and decide the next step.
- **Flow**:
  1. Der Tab **Verlauf** öffnet mit einer Highlight-Karte „Selbstentdeckung gesichert“, die den zuletzt sicheren Moment zeigt.
  2. Über "Zur Kamera" kann die Szene sofort erneut gespielt werden; "Im Lernmodus vertiefen" springt direkt zur passenden Trainingskarte.
  3. Jede Verlaufskarte beschreibt außerdem, ob der Eintrag sicher ist, noch Übung braucht oder überprüft werden sollte.

## 5. Caregiver Fixes a Misunderstanding (HIP&nbsp;3)
- **Story**: As a caregiver, I want to correct the app when it guesses wrong.
- **Flow**:
  1. In **Recognition** öffnet der Button **Hilfe** das Korrekturpanel mit vier Symbolvorschlägen.
  2. Die Auswahl des richtigen Symbols protokolliert eine Korrektur für spätere Trainings.

## 6. Caregiver Teaches a New Sign (HIP&nbsp;2)
- **Story**: As a caregiver, I want to record samples so the app learns a new gesture.
- **Flow**:
  1. Im Tab **Lernen** führt jede Karte über „Jetzt aufnehmen“ direkt zum **Recording**- bzw. **Training**-Flow.
  2. Der Flow zeichnet fünf Beispiele auf und speichert sie als Trainingsdaten.
  3. Nach Abschluss kehrt die App zum Tab **Lernen** zurück; über `WorkflowSupportLinks` gelangt man bei Bedarf in den Admin- oder Familienbereich.

## 7. Proactive Maintenance (HIP&nbsp;4)
- **Story**: As Amy's gestures drift over time, I want the app to gently ask for practice when accuracy drops.
- **Flow**:
  1. If a gesture's health score is low, a non-blocking banner appears in **Learning**.
  2. Tapping **Üben** (Practice) navigates directly to the **Training** flow.

## 8. Reviewing Progress
- **Story**: As a caregiver, I want to see analytics about Amy's learning progress.
- **Flow**:
  1. Über die `WorkflowSupportLinks` (z. B. auf **Kamera**, **Verlauf** oder **Lernen**) den Admin- oder Dashboard-Bereich nach dem Sicherheitsgate öffnen.
  2. Analytics are loaded from local storage and uploaded to the server when online.

## Screen Linking Overview
- `webapp/src/App.tsx` definiert die Routen für **Kamera**, **Verlauf** und **Lernen** sowie sekundäre Bereiche wie **Admin**, **Profile** und **Help**.
- `WorkflowStageHeader` stellt auf den Tabs das passende Wording sowie Navigation zum vorigen/nächsten Schritt der Schleife bereit.
- `WorkflowSupportLinks` bündelt Familien-, Einstellungs-, Admin- und Hilfseinträge und führt über das Parental-Gate zu den jeweiligen Bereichen.
