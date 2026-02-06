# Full Workflow Blind-Spot Analysis (White Rabbit Runbook)

## Purpose
Diese Analyse deckt blinde Flecken über den gesamten Amy’s-Echo-Flow auf:
1. Multimodale Erfassung (Hände + Pose + Gesicht + nonManual)
2. Bundle-Bau und Upload
3. Server-Ingestion und Qualitätsgates
4. Training und Modellauslieferung
5. Laufende Erkennung in der Webapp
6. Metacom-Integration im Kommunikations-UI

Ziel: **keine stille Verschlechterung**, **keine inkonsistenten Verträge**, **keine Unterbrechung für Amy**.

---

## White Rabbit Phases ("follow until self-discovery")

### Phase 1 — Seeing the stream
**Frage:** Was wird tatsächlich im Client produziert?
- Hände können vorhanden sein, während Face/Pose fluktuiert.
- `nonManualFeatures` sind abgeleitete Signale und können frameweise `null` enthalten.

**Blind Spot:** Feature ist "theoretisch" vorhanden, aber praktisch kaum abgedeckt.

**Mitigation:**
- `modalities.nonManual.coverage` immer mitführen und in QA auswerten.
- Minimal-Reporting pro Upload: Hands/Pose/Face/nonManual Coverage.

---

### Phase 2 — Trusting the bundle
**Frage:** Was geht beim ZIP-Bau verloren?
- Risiko: Felder in `metadata.json` oder `landmarks.json` werden bei Refactors unabsichtlich entfernt.

**Blind Spot:** Schema drift zwischen Webapp und Server.

**Mitigation:**
- Contract-Tests auf Bundle-Struktur (inkl. `nonManual`).
- Server-seitige tolerante Validierung + explizites Logging fehlender Modalitäten.

---

### Phase 3 — Ingestion reality
**Frage:** Was sieht der Server wirklich?
- Bundle kann formal gültig sein, aber für Training schwach (z. B. kaum verwertbare Frames).

**Blind Spot:** Nur technische Validierung, keine semantische Qualität.

**Mitigation:**
- Qualitätsgates beibehalten (Frame-Mindestanzahl, Jitter, Hand-Coverage).
- Rejection-Reasons strukturiert speichern (nicht nur Konsole).

---

### Phase 4 — Training truth
**Frage:** Wird aus multimodalen Daten tatsächlich gelernt?
- Trainingsdaten können multimodal sein, aber Modell nutzt evtl. nur Teilfeatures.

**Blind Spot:** "Multimodal gesammelt" wird fälschlich als "multimodal gelernt" interpretiert.

**Mitigation:**
- Trainingsreport erweitern um genutzte Feature-Kanäle.
- Delta-Metriken dokumentieren (mit/ohne nonManual).

---

### Phase 5 — Recognition in production
**Frage:** Kommt das trainierte Modell stabil im Client an?
- Download-/Versionierungsprobleme können zu stillen Fallbacks führen.

**Blind Spot:** Nutzer glaubt, personalisiertes Modell ist aktiv, tatsächlich läuft Fallback.

**Mitigation:**
- Sichtbarer Modellstatus im Recorder (Version + Quelle).
- Telemetrie-Ereignis bei Fallback auf Basis-Modell.

---

### Phase 6 — Metacom meaning layer
**Frage:** Ist Erkennung mit Symbolkommunikation konsistent gekoppelt?
- Erkanntes Label muss zuverlässig auf Metacom-Board-Semantik mappen.

**Blind Spot:** Gute Erkennung, aber falsches/fehlendes Symbol-Mapping.

**Mitigation:**
- Eindeutige Mapping-Tabelle (Gesture Label -> Symbol ID -> Board ID).
- Contract-Test für kritische Kernbegriffe (Essen, Trinken, Hilfe, Ja/Nein, Schmerz).
- Lizenzprüfung als Build-/Release-Gate für importierte Symbolpakete.

---

## End-to-End Blind-Spot Matrix

| Workflow-Stage | Haupt-Risiko | Sichtbares Symptom | Guardrail |
|---|---|---|---|
| Capture | Modalitätsabfall unter Last | Schwankende Erkennung | Coverage-Hinweise + Frame-Metriken |
| Bundle | Schema-Drift | Server akzeptiert, Qualität sinkt | Contract-Tests + feste Pflichtfelder |
| Ingestion | Nur syntaktische Checks | Viele schwache Samples im Manifest | Quality-Gates + Rejection-Analytics |
| Training | Feature-Kanal wird ignoriert | Kein Accuracy-Lift trotz mehr Daten | Kanal-Nutzungsreport + A/B-Auswertung |
| Model Delivery | Stiller Fallback | Veraltete/inkonsistente Ergebnisse | Version-UI + Fallback-Telemetrie |
| Metacom | Mapping-Fehler | Falsches Symbol trotz korrekter Gebärde | Mapping-Tests + manuelle Kernwort-QA |

---

## Self-Discovery Checkpoint (Amy’s Echo)

Amy’s Echo erreicht den "self-discovery"-Punkt, wenn folgende Aussagen gleichzeitig wahr sind:

1. **Ich sehe** multimodale Signale vollständig (hands/pose/face/nonManual).
2. **Ich erinnere** diese Signale verlustfrei über Bundle + Ingestion.
3. **Ich lerne** nachweisbar aus diesen Signalen (Trainingsreport zeigt Kanalnutzung).
4. **Ich spreche** über Metacom-Symbole konsistent und kindgerecht zurück.

Wenn einer der vier Punkte fehlt, ist die White-Rabbit-Reise noch nicht abgeschlossen.

---

## Recommended Next Actions

1. [x] **[P0, Backend, 1-2d]** Add explicit server schema validation for `frames[].nonManualFeatures` keys and numeric/null values. ✅ Implemented in `trainingBundleRoute.ts` with strict schema validation.
2. [x] **[P1, Observability, 2-3d]** Add an ingestion metric for "nonManual coverage percentile" per profile (p50/p90). ✅ Implemented via rolling coverage samples + percentile summaries in ingestion metrics.
3. [x] **[P1, ML, 2-3d]** Extend training report with modality-channel usage summary. ✅ Added modality usage summary to the training report output.
4. [x] **[P0, Integration, 1-2d]** Add E2E test: recognized label -> Metacom symbol mapping for starter vocabulary. ✅ Added mapping test for starter labels against the Metacom start board.
5. [ ] **[P2, Operations, weekly]** Add checklist item: verify model version + Metacom mapping on staging each week. (Human ops task)
