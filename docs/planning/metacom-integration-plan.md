# Metacom-Integration – Plan zur Anpassung an MetaTalk

## Kontext & Ziel
Die MetaTalk-Handbuchreferenz beschreibt eine strukturierte Symbolkommunikation mit klaren Kategorien, schnellen Zugriffspfaden und stabilen Layouts. Ziel ist es, die bewährten Metacom-Prinzipien in Amy’s Echo so abzubilden, dass Amy **schnell, zuverlässig und ohne Verwirrung** kommunizieren kann. Diese Anpassung soll keine parallele UI-Philosophie einführen, sondern die bestehenden Amy-First-Prinzipien mit einem Metacom-kompatiblen Vokabular- und Layout-Modell verbinden.

## Amy Impact (Warum das Amy hilft)
- **Schneller Zugriff auf Kernwörter**: Metacom-Layouts priorisieren häufige Aussagen; Amy erhält dadurch schnellere, zuverlässigere Kommunikation.
- **Stabile Raster und Kategorien**: Gleichbleibende Positionen reduzieren kognitive Last und fördern die Automatisierung von Spracheingaben.
- **Verlässliche Notfallpfade**: Sofortige Erreichbarkeit von Kernbotschaften (z. B. „Hilfe“, „Stopp“, „Ja/Nein“) erhöht Sicherheit.

## Leitprinzipien für die Anpassung
- **Keine Unterbrechung**: Metacom-Layouts dürfen die laufende Kommunikation nicht stören (z. B. keine Umstrukturierung ohne klare Migration).
- **Keine Verwirrung**: Kategorien, Farben und Symbole müssen konsistent bleiben; Positionsstabilität hat Vorrang.
- **Keine Verzögerung**: Caching, lokale Vorhaltung und schnelle UI-Reaktionszeiten sind Pflicht.
- **Keine Abhängigkeit von externen Diensten**: Offline-Nutzung bleibt voll funktionsfähig.
- **Deutsch für alle sichtbaren Texte**: Alle UI-Texte bleiben deutsch und kindgerecht.

## Discovery-Ergebnisse
- Eine Metacom-spezifische Datenstruktur existiert; Import für lokale Bundles ist in der Webapp verfügbar.
- Die DGS- und Trainingspipelines sind bereits etabliert; die Anpassung betrifft primär **Vokabularverwaltung**, **Layout/Board-Struktur**, **UI-Präsentation** und **Inhalte**.

## Aktueller Implementierungsstand
- **Webapp-Starttafel verfügbar**: `webapp/src/components/MetacomBoard.tsx` rendert eine feste Metacom-Starttafel mit Kategorien (Essen/Trinken/Spielen) und Kernwörtern.
- **Lokale Board-Definitionen**: `webapp/src/constants/metacomBoards.ts` enthält die initialen Boards als strukturierte Definitionen.
- **Typisierung**: `webapp/src/types/metacom.ts` definiert das Board- und Zellmodell für weitere Erweiterungen.
- **Import in der Webapp**: Im Adminbereich lassen sich Metacom-Bundles (JSON) laden und zurücksetzen.
- **Open-Board-Format**: `.obf`-Boards werden für den Import in Metacom-Boards umgewandelt.
- **Satzkomponist vorhanden**: Mehrere Symbole können als Satz gelesen werden; Satzbau-Logik ist noch in Planung.

## Satzbau & Symbolkombinationen (Planung)

Metacom-orientierte Kommunikation braucht einfache Satzkerne (Subjekt–Verb–Objekt)
und klare Modifier (z. B. „ohne“, „mit“, „mehr“). Wir planen ein Rollenmodell und
eine optionale Slotting-Ansicht, damit Amy und andere Kinder vollständige Sätze
mit Metacom-Symbolen bauen können. _Siehe `docs/metacom/metacom-sentence-composition.md`._

## Annahmen & Risiken
- **Rechte/Lizenzen**: Metacom-Symbole und -Layouts unterliegen voraussichtlich Lizenzbedingungen. Vor Integration ist eine rechtliche Freigabe erforderlich.
- **UI-Stabilität**: Eine Layout-Umstellung muss migriert werden, ohne bestehende Amy-Boards zu beschädigen.
- **Barrierefreiheit**: Farb- und Symbolkontraste müssen für Amy geeignet bleiben.

## Geplante Architektur-Anpassungen (High-Level)
1. **Vokabular-Datenmodell**
   - Einführung einer strukturierten Metacom-kompatiblen Board- und Symbolhierarchie.
   - Persistente IDs für Symbole, Kategorien und Layoutpositionen.
   - Versionsschema für Layouts, damit Migrationen nachvollziehbar bleiben.

2. **Import & Verwaltung von Metacom-Inhalten**
   - Import-Pipeline (offline) für Symbolsets und Metacom-Board-Definitionen.
   - Validierung: fehlende Symbole, inkonsistente Kategorien, doppelte IDs.
   - Lizenz- und Quellenmetadaten pro Symbolset.

3. **UI-Integration (Board-Ansicht)**
   - Rasterbasierte Darstellung mit fester Zellbelegung.
   - Farb- und Kategoriekennzeichnung gemäß Metacom-Logik.
   - Schneller Zugriff auf Kernwörter (Top-Row/konstante Positionen).

4. **Bedienlogik & Interaktion**
   - Direkte Auswahl (Tap) als Standard.
   - Optional: Scanning-Modus für alternative Eingaben.
   - Sofortiges akustisches Feedback (TTS) ohne Blockierung der UI.

5. **Migration bestehender Boards**
   - Mapping-Tabelle für bestehende Amy-Boards → Metacom-Boards.
   - Fallback: Wenn kein Mapping möglich ist, bleibt das alte Board unangetastet.
   - Benutzerhinweise in deutscher, einfacher Sprache.

## Konkreter Implementierungsplan

### Phase 1 – Datenmodell & Import (Server + Webapp)
- **Server**: Schema für Metacom-Board-Definitionen (JSON) inkl. IDs, Positionen, Kategorien, Symbol-Assets.
- **Webapp**: Lesestruktur und Cache (lokal, offline), inklusive Versionsprüfung.
- **Validierungstests**: Prüfen, dass Pflichtfelder vorhanden sind und IDs stabil bleiben.

### Phase 2 – UI-Rendering & Interaktion
- **Board-Komponente**: Rasterlayout mit fester Zellzuordnung.
- **Kategorien**: Einfache, klare Farbcodierung.
- **Deutschsprachige UI**: Labels wie „Zurück“, „Mehr“, „Schnellwahl“.
- **Audio**: Sofortige Sprachausgabe nach Auswahl.

### Phase 3 – Migration & Fallbacks
- **Migrationsskript**: Zuordnung bestehender Boards auf neue Metacom-Strukturen.
- **Fallback**: Wenn Zuordnung unsicher ist, bleibt das bisherige Layout aktiv.
- **Logging**: Nur intern auf Englisch; Nutzertexte bleiben deutsch.

### Phase 4 – Tests & Verifikation
- **Unit-Tests**: Datenmodell-Validierung, Import-Pipeline, Layout-Konsistenz.
- **Integration**: Laden eines Metacom-Boards, Auswahl, TTS, Rücknavigation.
- **Manuelle QA**: Checkliste mit festen Beispielen (z. B. „Ich möchte trinken“, „Hilfe“).

## Teststrategie
- **Type-Check + Lint**: Webapp und Server.
- **Unit-Tests**: Fokus auf Importvalidierung und Layout-Rendering.
- **E2E (Integration)**: Board laden → Symbol auswählen → Sprachausgabe.

## Offene Fragen
1. **Lizenzierung**: Welche Metacom-Symbole dürfen genutzt werden?
2. **Vokabularumfang**: Startet das Set mit Kernwörtern oder vollständigem Metacom-Katalog?
3. **Kategoriefarben**: Gibt es definierte Metacom-Farbstandards, die wir übernehmen müssen?
4. **Scanning-Modus**: Ist dieser für Amy zwingend erforderlich oder optional?

## Dokumentation, die aktualisiert wird
- `docs/planning/todo.md` – Roadmap-Eintrag für die Metacom-Integration.
- `docs/integration/` – Integration-Guide für Metacom-Boards (neu).
