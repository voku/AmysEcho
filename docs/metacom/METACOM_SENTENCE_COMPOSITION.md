# Metacom Satzbau & Symbolkombinationen

## Ziel

Dieses Dokument bündelt eine erste Recherche zum Satzbau mit Metacom-Symbolen
und leitet daraus Anforderungen für die Webapp ab. Es dient als Grundlage für
die geplante Satz-Kompositionslogik, damit Amy und andere Kinder vollständige,
verständliche Sätze bilden können.

## Recherche-Notizen (Internet-Überblick)

**Status: erste Sichtung, Quellen müssen rechtlich geprüft und final kuratiert werden.**

- MetaTalk/Metacom-Handbücher betonen **Kernwörter**, stabile Raster und klar
  getrennte Kategorien (Personen, Aktionen, Dinge, Attribute).
- AAC-Leitfäden empfehlen **Satzkerne** (Subjekt + Verb + Objekt) und optional
  **Modifier** (z. B. „ohne“, „mit“, „mehr“) als Nachsatz.
- In deutschen AAC-Rastern wird häufig ein **Satzstreifen** genutzt, der die
  Reihenfolge Subjekt → Verb → Objekt abbildet; Modifier folgen dem Objekt.

> Hinweis: Diese Punkte sind Zusammenfassungen. Konkrete Quellen-URLs werden in
> einem Lizenz-Review ergänzt, bevor wir Inhalte in der App direkt referenzieren.

### Gefundene Basisquellen (nicht Metacom-spezifisch, Lizenzprüfung nötig)

- https://www.asha.org/public/speech/disorders/aac/
- https://en.wikipedia.org/wiki/Augmentative_and_alternative_communication

## Satzbau-Modelle (Deutsch, AAC-geeignet)

### 1) Minimaler Satzkern
- **Subjekt** (z. B. „Ich“, „Du“, „Wir“)
- **Verb/Aktion** (z. B. „essen“, „trinken“, „spielen“)
- **Objekt** (z. B. „Brot“, „Pizza“, „Wasser“)

Beispiele:
- „Ich essen Brot“
- „Du trinken Wasser“

### 2) Satzkern + Modifier
- **Modifier** folgen dem Objekt und beziehen sich auf das zuletzt gewählte
  Nomen (z. B. „Pizza“ → „ohne Käse“).

Beispiele:
- „Ich essen Pizza ohne Käse“
- „Mehr Saft kalt“

### 3) Negation / Verneinung
- Verneinung als eigener Symboltyp (z. B. „nicht“, „kein“, „ohne“).
- **Regel**: Negationen binden sich an die nächste semantische Einheit.

Beispiele:
- „Ich nicht essen“
- „Kein Käse“
- „Pizza ohne Käse“

## Ableitungen für die Webapp

### A) Symbolrollen (für spätere Automatik)
Wir brauchen eine leichte Rollen-Zuordnung, die optional ist:
- **Person**: Ich, Du, Wir
- **Aktion**: Essen, Trinken, Spielen
- **Objekt**: Brot, Pizza, Wasser
- **Modifier**: Ohne Käse, Mit Käse, Mehr, Warm
- **Negation**: Nicht, Kein, Ohne
### B) Slotting-Logik (Vorschlag)
- Standardreihenfolge: **Person → Aktion → Objekt → Modifier → Negation**
- Wenn der Nutzer frei tippt, bleibt die Reihenfolge wie gewählt.
- Optional kann ein „Satzbau-Hinweis“ die Slots visuell markieren.

### B.1) Mehrschichtige Satzvorschau (UI)
- Der Satzkomponist zeigt eine **Satzvorschau** in klaren Textschichten:
  - **Letzte Auswahl** (direktes Feedback nach jedem Tipp).
  - **Satzvorschau** (aktueller Satz als durchgehender Text).
  - **Nächster Schritt** (kontextabhängiger Hinweis auf den nächsten Baustein).
- Bei aktivem Slotting wird der „Nächster Schritt“-Hinweis aus der ersten
  fehlenden Rolle (Person/Aktion/Objekt/Modifier/Negation) abgeleitet.
- Ohne Slotting bleibt der Hinweis generisch („Füge ein weiteres Symbol hinzu“),
  damit die freie Kommunikation nicht eingeschränkt wird.

### C) Follow-on Kategorien (Modifier-Boards)
- Modifier-Boards hängen an einem Objekt (z. B. **Pizza → Ohne Käse**).
- Diese Beziehung soll konfigurierbar sein (pro Profil), damit andere Kinder
  eigene Kombinationen wählen können.

### D) LLM-gestützte Satzverbesserung (Server)
- Optional kann der Satzkomponist einen fertigen Satz an den Server schicken,
  um eine kurze, kindgerechte Formulierung zu erhalten.
- API-Route: `POST /api/v1/metacom/sentence-improve` (authentifiziert).
- Antwort: `{ "improvedSentence": "Ich esse Brot." }`
- Konfiguration über `OPENAI_API_KEY` (optional) und Modell-Parameter in der
  Server-Umgebung.
- In der Webapp wird ein Vorschlag mit eigener „Vorschlag sprechen“-Aktion
  angezeigt; ohne Anmeldung bleibt der Button deaktiviert und zeigt einen
  Hinweis, dass eine Anmeldung nötig ist.
- Zusätzlich zeigt der Satzkomponist dynamische Labels für „Nächste Wörter“,
  die Alter, Tageszeit und den zuletzt gesprochenen Satz berücksichtigen.
- Metacom unterstützt vier Wortschatz-Stufen (Einsteiger, Basis, Erweitert,
  Voll) sowie eine Merkliste für häufig benötigte Wörter (aktuell deutschsprachig).
- Die Satzleiste orientiert sich am MetaTalk-Layout: Symbole erscheinen in einer
  horizontalen Leiste mit Emoji + Label, ergänzt durch eine obere Statuszeile,
  eine linke Schnellauswahl und eine kompakte Toolbar.

## Vorschlag für Datenstruktur (Konzept)

```json
{
  "id": "metacom_pizza",
  "label": "Pizza",
  "role": "object",
  "followOnBoardIds": ["pizza_modifier"],
  "speech": "Pizza"
}
```

```json
{
  "id": "pizza_modifier",
  "label": "Pizza-Varianten",
  "cells": [
    { "id": "metacom_pizza_ohne_kaese", "label": "Ohne Käse", "role": "modifier" },
    { "id": "metacom_pizza_mit_kaese", "label": "Mit Käse", "role": "modifier" }
  ]
}
```

## Release-Slices (JUL-P2-1)

Ziel der Slices ist, die Satz-Komposition in klaren, testbaren Etappen bis zur
Release-Entscheidung aufzubauen, ohne Amy im Alltag zu blockieren.

### Slice 1 — Stabiler Satzkern (MVP)
**Umfang**
- Rollen-gestützte Reihenfolge für Person → Aktion → Objekt als **optional**
  aktivierbarer Hinweis.
- Freie Eingabe bleibt jederzeit möglich (kein hartes Blockieren).
- Satzvorschau mit sofortigem Feedback nach jeder Symbolauswahl.

**Akzeptanzkriterien**
- Ein Satz mit Person, Aktion und Objekt wird in der Vorschau konsistent
  aufgebaut.
- Nutzer können Symbole weiterhin frei platzieren, ohne dass bestehende Reihen
  gelöscht oder umsortiert werden.
- Bei unvollständigem Satz zeigt der „Nächster Schritt“-Hinweis die zuerst
  fehlende Kernrolle.

**Test-Gates**
- Unit-Tests für Rollenreihenfolge und Fallback bei freier Eingabe.
- UI-Tests für Satzvorschau und „Nächster Schritt“-Hinweise.
- Regressionstest: bestehende Symbolauswahl/Sprachausgabe bleibt unverändert.

### Slice 2 — Modifier & Negation sicher anbinden
**Umfang**
- Modifier-Boards pro Objekt nutzbar machen (z. B. Pizza → Ohne Käse).
- Negationssymbole konsistent an nächste semantische Einheit koppeln.
- Konfliktarme Darstellung bei mehreren Modifiers im Satzstreifen.

**Akzeptanzkriterien**
- Objektgebundene Modifier werden nach Objekt positioniert und bleiben bei
  Bearbeitung stabil.
- Negationen werden in der Vorschau sprachlich sinnvoll platziert
  (z. B. „nicht essen“, „ohne Käse“).
- Entfernen eines Objekts entfernt oder entkoppelt zugehörige Modifier ohne
  defekte Restzustände.

**Test-Gates**
- Unit-Tests für Modifier-Bindung und Negationsregeln.
- Integrationstests für Hinzufügen/Entfernen/Umsortieren im Satzstreifen.
- Snapshot/Rendering-Tests für mehrteilige Sätze mit Modifiers.

### Slice 3 — Profil- und Konfigurationsfähigkeit
**Umfang**
- Profilabhängige Follow-on-Konfiguration für Objekt → Modifier-Beziehungen.
- Sichere Default-Fallbacks bei fehlender oder veralteter Konfiguration.
- Import/Export der Satzbau-relevanten Konfigurationsdaten.

**Akzeptanzkriterien**
- Profilwechsel lädt jeweils die passende Modifier-Konfiguration.
- Fehlende Konfiguration führt zu nutzbarer Standarddarstellung statt Fehler.
- Exportierte Konfiguration kann ohne Datenverlust reimportiert werden.

**Test-Gates**
- Persistenztests für Profilwechsel und Registry-Synchronisierung.
- Schema-Validierungstests für Import/Export.
- Fehlertests für unvollständige Konfigurationsobjekte (robuster Fallback).

### Slice 4 — Vorschlagslogik & Release-Gate
**Umfang**
- LLM-Satzverbesserung als optionale, klar getrennte Hilfsfunktion.
- Sichtbare Zustände für nicht angemeldete Konten und Serverfehler.
- Release-Entscheidung anhand definierter Qualitäts- und Stabilitätsmetriken.

**Akzeptanzkriterien**
- Ohne Auth bleibt die Kernkommunikation nutzbar; nur Vorschlagsfunktion ist
  deaktiviert.
- Serverfehler bei Satzverbesserung blockieren weder Satzaufbau noch Sprechen.
- Release-Freigabe erfolgt nur bei bestandenem Test-Gate über alle Slices.

**Test-Gates**
- API-Integrationstests für Erfolgs- und Fehlerpfade der Verbesserung.
- E2E-Tests für „ohne Login“, „mit Login“ und „Serverfehler“-Szenarien.
- Dokumentierter Release-Check mit Pass/Fail pro Kriterium.

## Verifikationsplan (projektweit)

1. **Technische Verifikation**
   - Alle neuen Unit-, Integrations- und E2E-Tests sind grün.
   - Type-Check und Lint bleiben ohne neue Warnungen/Fehler.
2. **Produktverifikation (Amy First)**
   - Keine zusätzliche Eingabeverzögerung im Satzaufbau.
   - Keine regressiven Änderungen an bestehender Symbolkommunikation.
3. **Dokumentationsverifikation**
   - Jede Slice-Änderung aktualisiert diese Roadmap und den Topic-Board-Status.
   - Testevidenz wird in `docs/testing/` oder verlinkten Artefakten abgelegt.
