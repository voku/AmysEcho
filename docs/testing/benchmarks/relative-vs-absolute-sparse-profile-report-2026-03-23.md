# Relative vs Absolute Feature Mode Benchmark (Sparse Profile) — 2026-03-23

## Goal

Evaluate whether optional `relative_delta` feature generation improves sparse-profile recognition quality versus the default `absolute` mode.

## Dataset and protocol

- Source clips: `server/data/dgs_video_examples/*_landmarks.json`
- Label selection: first 8 labels with at least 2 clips each
- Sparse setup: first clip per label for train, second clip per label for validation (grouped by clip, no within-clip leakage)
- Windowing: existing `create_sliding_windows` with identical frame normalization and weights in both modes
- Scoring model: deterministic nearest-centroid baseline over flattened window vectors (same scorer for both modes)
- Date run: 2026-03-23

### Command used

```bash
python - <<'PY'
import json, re
from pathlib import Path
import numpy as np
import sys
sys.path.append('server/training')
from frame_normalization import _normalize_frame
from sliding_window import create_sliding_windows

video_dir=Path('server/data/dgs_video_examples')
files=sorted(video_dir.glob('*_landmarks.json'))[:80]
label_to_clips={}
for p in files:
    stem=p.stem.replace('_landmarks','')
    m=re.match(r'(.+?)_(?:main|var)_.+', stem)
    label=m.group(1) if m else stem.split('_')[0]
    data=json.loads(p.read_text())
    frames=data.get('frames',[])
    vecs=[]; weights=[]
    for f in frames:
        v=_normalize_frame(f.get('landmarks'),f.get('poseLandmarks'),f.get('faceLandmarks'))
        if v is not None:
            vecs.append(v); weights.append(float(f.get('weight',1.0)))
    if len(vecs)>=3:
        label_to_clips.setdefault(label,[]).append((p.name,vecs,weights))

labels=sorted([l for l,c in label_to_clips.items() if len(c)>=2])[:8]
train=[(l,label_to_clips[l][0]) for l in labels]
val=[(l,label_to_clips[l][1]) for l in labels]

def run(mode):
    train_vecs=[]; train_lbl=[]
    for lbl,(name,vecs,weights) in train:
        for s in create_sliding_windows(vecs,lbl,{'source_bundle_id':name},weights,feature_mode=mode):
            train_vecs.append(np.array(s.landmarks,dtype=np.float32)); train_lbl.append(lbl)
    centroids={l:np.mean([v for v,y in zip(train_vecs,train_lbl) if y==l],axis=0) for l in labels}
    correct=0; total=0
    for lbl,(name,vecs,weights) in val:
        for s in create_sliding_windows(vecs,lbl,{'source_bundle_id':name},weights,feature_mode=mode):
            v=np.array(s.landmarks,dtype=np.float32)
            pred=min(labels,key=lambda lab: float(np.linalg.norm(v-centroids[lab])))
            total += 1
            correct += int(pred==lbl)
    print(mode, correct, total, correct/total if total else 0.0, len(labels))

run('absolute')
run('relative_delta')
PY
```

## Results

| Mode | Correct windows | Total windows | Window accuracy | Labels |
|---|---:|---:|---:|---:|
| `absolute` | 17 | 69 | 0.2464 | 8 |
| `relative_delta` | 12 | 69 | 0.1739 | 8 |

## Recommendation

- Keep **`absolute` as default** (`MLP_FEATURE_MODE=absolute`).
- Keep `relative_delta` as an **experiment-only** option.
- Re-run this benchmark after adding profile-specific clip sets with stronger signer-position drift; current sparse run does not justify switching defaults.
