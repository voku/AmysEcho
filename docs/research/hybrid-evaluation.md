# Hybrid vs Local Evaluation (Offline)

This utility summarizes how much the hybrid pipeline improves over local‑only on a labeled dataset.

- Script: `scripts/eval-hybrid.js`
- Input: JSON array of samples with fields:
  - `id`: sample id
  - `truth`: ground-truth label
  - `local`: `{ probabilities: number[], labels: string[] }`
  - `remote` (optional): `{ label: string, confidence: number }`
- Threshold: `--threshold=0.6` (default) to accept remote results.

Example dataset entry:
```json
{
  "id": "sample-001",
  "truth": "thumbs_up",
  "local": {
    "labels": ["thumbs_up", "stop", "point"],
    "probabilities": [0.42, 0.30, 0.28]
  },
  "remote": { "label": "thumbs_up", "confidence": 0.88 }
}
```

Run:
```bash
node scripts/eval-hybrid.js path/to/dataset.json --threshold=0.6
```

Output:
- Total samples
- Local accuracy
- Hybrid accuracy (remote used when above threshold)
- Improved cases (hybrid correct while local incorrect)

Notes
- This is a lightweight, dependency-free evaluator — it does not run models; instead it consumes local probabilities and optional remote decisions for quick comparison and reporting.
- For end-to-end validation, use `docs/testing/device-testing.md` and `docs/testing/gesture-recognition-testing.md`.
