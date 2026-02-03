# Global Baseline Promotion Policy (DGS Training Data)

This policy defines when caregiver-submitted training data can be promoted from
`data/datasets/training_manifest.json` into the global baseline dataset
(`data/dgs_samples.json`) and used to refresh `server/data/models/global/`.

## Ziele

- **Sicher & reproduzierbar**: Nur stabile, nachvollziehbare Daten fließen in das globale Modell.
- **Amy First**: Zuverlässigkeit ist wichtiger als Geschwindigkeit beim globalen Rollout.
- **Transparenz**: Klare Kriterien für Pflegepersonen und das Team.

## Mindestanforderungen pro Gebärde

| Kriterium | Zielwert | Quelle |
| --- | --- | --- |
| Mindest-Samples pro Gloss | **5** | `server/data/config/kid_starter_preset.json` (`minSamplesPerGloss`) |
| Ziel-Samples pro Gloss | **15** | `server/data/config/kid_starter_preset.json` (`targetSamplesPerGloss`) |
| Mindest-Frames pro Sample | **8** | `server/src/constants/trainingQuality.ts` |
| Hand-Coverage | **≥ 70%** | `server/src/constants/trainingQuality.ts` |
| Jitter (Hand) | **≤ 0.2** | `server/src/constants/trainingQuality.ts` |
| Jitter (Pose) | **≤ 0.15** | `server/src/constants/trainingQuality.ts` |
| Jitter (Face) | **≤ 0.12** | `server/src/constants/trainingQuality.ts` |

## Qualitäts-Metriken (pro Bundle)

Jedes Bundle bekommt bei der Ingest-Phase eine `validationSummary` mit:

- `frameCount`
- `qualityScore`
- `confidence`
- `issues`

Diese Werte stammen aus dem Webapp-Validator (`webapp/src/training/trainingValidator.ts`)
und helfen, **zu schwache Aufnahmen frühzeitig zu erkennen**, bevor sie in die
globale Stichprobe gelangen.

## Promotion-Workflow

1. **Ingest-Gate bestehen**  
   Bundles müssen die Qualitätsgrenzen in `server/src/constants/trainingQuality.ts`
   einhalten (Frames, Coverage, Jitter).

2. **Stichproben-Check pro Gloss**  
   - Mindestens **5 gültige Samples** pro Gloss erforderlich.
   - Für neue Glosses: mindestens **2 unterschiedliche Profile**, um Einseitigkeit
     zu vermeiden.

3. **Manueller Review (Pflicht)**  
   Im Kid-Start-Preset ist `reviewRequiredForGlobal: true` gesetzt. Der Review
   bestätigt:
   - **Kein fehlendes Hand-Material**
   - **Konsistente Hand-Fokus-Erkennung**
   - **Keine starken Ausreißer** in `qualityScore` oder `confidence`

4. **Promotion markieren**  
   Markiere den Gloss im Review-Log (z. B. Release-Notiz oder QA-Protokoll) und
   aktualisiere das globale Training mit `train_mlp.py`.

5. **Checksum + Metadata aktualisieren**  
   Nach dem Training:
   - `server/data/models/global/amy_model.npz`
   - `server/data/models/global/amy_model.npz.sha256`
   - `server/data/models/global/training_metadata.json`

## Entscheidungshilfe

Ein Gloss darf in das globale Modell, wenn:

- alle Mindestanforderungen erfüllt sind,
- kein Quality-Gate-Fehler auftaucht,
- der Review bestätigt ist,
- das Gloss im Kid-Starter-Vokabular oder der aktuellen Produktliste steht.

## Dokumentation & Nachweis

- **Qualitäts-Gates**: `docs/training/VIDEO_RECORDING_AND_TRAINING_WORKFLOW.md`
- **Baseline-Erstellung**: `docs/training/BASELINE_MODEL_PIPELINE.md`
- **Review-Checkliste**: `docs/operations/PRODUCTION_TRAINING_CHECKLIST.md`
