# Realistic DGS Training Cycle Experiment (2026-03-01)

Dieses Dokument protokolliert einen reproduzierbaren Vergleichslauf mit `scripts/realistic_dgs_training_cycle.py` auf den vorhandenen DGS-Landmark-Dateien aus dem Repository.

## Ziel

Prüfen, ob sich die Erkennungsrate durch einen längeren Multi-Attempt-Trainingslauf mit steigender Epochenzahl messbar verbessern lässt.

## Lauf 1 — Kurzlauf (Referenz)

Befehl:

```bash
python3 scripts/realistic_dgs_training_cycle.py \
  --attempts 1 \
  --epoch-schedule 5 \
  --timeout-seconds 14400 \
  --usable-accuracy 0.35 \
  --max-files-per-label 2
```

Ergebnis (CLI-Output):

- `bestAccuracy`: **0.18344519015659955**
- `bestMacroF1`: **0.056285178236397754**
- `usable`: **false**

## Lauf 2 — Verbesserter Multi-Attempt-Lauf

Befehl:

```bash
python3 scripts/realistic_dgs_training_cycle.py \
  --attempts 3 \
  --epoch-schedule 20,40,80 \
  --timeout-seconds 14400 \
  --usable-accuracy 0.35 \
  --max-files-per-label 3
```

Ergebnis (Report + CLI-Output):

- `bestAccuracy`: **0.36465324384787473**
- `bestMacroF1`: **0.27745796652007554**
- `usable`: **true**
- `bestAttempt`: **3** (bei `epochs=80`)

Per-Attempt-Ergebnisse:

1. Attempt 1 (`epochs=20`): Accuracy `0.2662192393736018`, Macro F1 `0.16278768414638528`
2. Attempt 2 (`epochs=40`): Accuracy `0.25279642058165547`, Macro F1 `0.15170931215641653`
3. Attempt 3 (`epochs=80`): Accuracy `0.36465324384787473`, Macro F1 `0.27745796652007554`

## Fazit

Die Erkennungsrate konnte in diesem reproduzierbaren Lauf deutlich verbessert werden:

- Accuracy von **0.1834** auf **0.3647** (+0.1812 absolut, ~+98.8% relativ)
- Macro F1 von **0.0563** auf **0.2775** (+0.2212 absolut)

Damit wurde die konfigurierte Nutzbarkeitsschwelle (`--usable-accuracy 0.35`) erreicht.


## Umsetzung im echten Code (Default-Preset)

Die aus dem Chat validierten Parameter sind jetzt als Default im Skript gesetzt:

- `--epoch-schedule 20,40,80`
- `--max-files-per-label 3`
- `--usable-accuracy 0.35`

Zusätzlich kann das beste Modell direkt als globales Modell übernommen werden:

- `--promote-best-global-model`

Validierung nach Implementierung (mit den neuen Defaults):

- `bestAccuracy`: **0.36507936507936506**
- `bestMacroF1`: **0.13248522571830845**
- `usable`: **true**



## Integration in den Projekt-Workflow

Die Erkenntnisse wurden in den laufenden Workflow übernommen:

- Preset-Flag `--workflow-preset chat-validated-2026-03` erzwingt die validierten Parameter
  (`attempts=3`, `epoch-schedule=20,40,80`, `max-files-per-label=3`, `usable-accuracy=0.35`).
- `--auto-promote-on-usable` übernimmt bei erreichter Nutzbarkeit das beste Modell direkt als globales Modell.
- Standardisierter Aufruf für Maintainer: `npm run train:mlp:realistic --prefix server`.
