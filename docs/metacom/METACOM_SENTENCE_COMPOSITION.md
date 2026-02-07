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

## Nächste Schritte (Plan)

1. **Quellen verifizieren** (Lizenz & Inhalt).
2. **Rollenmodell** im Metacom-Schema ergänzen (optional).
3. **Slotting/Komposition** als UI-Option im Satzkomponisten testen.
4. **Admin-Konfiguration** für Follow-on Kategorien (pro Profil).
5. **Tests**: Satzbau-Reihenfolge, Modifier-Bindung, Export/Import.
