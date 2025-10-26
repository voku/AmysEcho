import importlib
import json
from pathlib import Path


def test_build_samples_from_manifest_uses_video_extension(monkeypatch, tmp_path):
    data_dir = tmp_path / "data"
    manifest_path = data_dir / "datasets" / "training_manifest.json"
    monkeypatch.setenv("MLP_DATA_DIR", str(data_dir))
    monkeypatch.setenv("MLP_MANIFEST_PATH", str(manifest_path))

    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))

    bundle_rel = Path("training_uploads/unassigned/bundle-1")
    bundle_dir = data_dir / bundle_rel
    bundle_dir.mkdir(parents=True)

    clip_rel = "clip.webm"
    clip_path = bundle_dir / clip_rel
    clip_path.write_bytes(b"fake-webm-bytes")

    manifest = {
        "entries": [
            {
                "id": "bundle-1",
                "profileId": None,
                "label": "HALLO",
                "capturedAt": "2024-05-28T12:03:11Z",
                "storage": {
                    "directory": str(bundle_rel),
                    "bundle": str(bundle_rel / "bundle.zip"),
                    "files": [clip_rel],
                    "clip": clip_rel,
                },
                "metadata": {
                    "label": "HALLO",
                    "profileId": None,
                    "clipFilename": clip_rel,
                },
                "receivedAt": "2024-05-28T12:05:00Z",
            }
        ]
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    frame_landmarks = [[float(i), float(i), float(i)] for i in range(42)]
    frames = [{"landmarks": frame_landmarks}]
    captured = {}

    def fake_extract(path: Path):
        captured["path"] = path
        return frames

    monkeypatch.setattr(module, "extract_landmarks_from_clip", fake_extract)

    samples, stats = module.build_samples_from_manifest(module.MANIFEST_PATH)

    assert captured["path"] == clip_path
    assert samples
    assert stats["cache_writes"] == 1
    assert stats["cache_hits"] == 0
    assert samples[0].label == "HALLO"
