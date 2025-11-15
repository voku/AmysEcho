import importlib
import json
from pathlib import Path

import pytest


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


def test_build_samples_from_manifest_uses_still_image(monkeypatch, tmp_path):
    data_dir = tmp_path / "data"
    manifest_path = data_dir / "datasets" / "training_manifest.json"
    monkeypatch.setenv("MLP_DATA_DIR", str(data_dir))
    monkeypatch.setenv("MLP_MANIFEST_PATH", str(manifest_path))

    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))

    bundle_rel = Path("training_uploads/unassigned/bundle-2")
    bundle_dir = data_dir / bundle_rel
    bundle_dir.mkdir(parents=True)

    still_rel = "still.jpg"
    still_path = bundle_dir / still_rel
    still_path.write_bytes(b"fake-image-bytes")

    manifest = {
        "entries": [
            {
                "id": "bundle-2",
                "profileId": None,
                "label": "BITTE",
                "capturedAt": "2024-05-28T12:03:11Z",
                "storage": {
                    "directory": str(bundle_rel),
                    "bundle": str(bundle_rel / "bundle.zip"),
                    "files": [still_rel],
                    "still": still_rel,
                },
                "metadata": {
                    "label": "BITTE",
                    "profileId": None,
                    "stillFilename": still_rel,
                },
                "receivedAt": "2024-05-28T12:05:00Z",
            }
        ]
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    still_landmarks = [[float(i), float(i) + 0.1, float(i) + 0.2] for i in range(42)]
    fake_frame = {"landmarks": still_landmarks}

    monkeypatch.setattr(module, "extract_landmarks_from_clip", lambda _path: [])
    monkeypatch.setattr(module, "extract_landmarks_from_still", lambda _path: fake_frame)

    samples, stats = module.build_samples_from_manifest(module.MANIFEST_PATH)

    assert stats["cache_hits"] == 0
    assert stats["cache_writes"] == 0
    assert len(samples) == 1
    assert samples[0].label == "BITTE"
    for observed, expected in zip(samples[0].landmarks, still_landmarks):
        assert observed == pytest.approx(expected)


def test_build_samples_from_manifest_appends_still_to_clip(monkeypatch, tmp_path):
    data_dir = tmp_path / "data"
    manifest_path = data_dir / "datasets" / "training_manifest.json"
    monkeypatch.setenv("MLP_DATA_DIR", str(data_dir))
    monkeypatch.setenv("MLP_MANIFEST_PATH", str(manifest_path))

    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))

    bundle_rel = Path("training_uploads/unassigned/bundle-3")
    bundle_dir = data_dir / bundle_rel
    bundle_dir.mkdir(parents=True)

    clip_rel = "clip.webm"
    still_rel = "still.png"
    (bundle_dir / clip_rel).write_bytes(b"fake-webm")
    (bundle_dir / still_rel).write_bytes(b"fake-image")

    manifest = {
        "entries": [
            {
                "id": "bundle-3",
                "profileId": None,
                "label": "HALLO",
                "capturedAt": "2024-05-28T12:03:11Z",
                "storage": {
                    "directory": str(bundle_rel),
                    "bundle": str(bundle_rel / "bundle.zip"),
                    "files": [clip_rel, still_rel],
                    "clip": clip_rel,
                    "still": still_rel,
                },
                "metadata": {
                    "label": "HALLO",
                    "profileId": None,
                    "clipFilename": clip_rel,
                    "stillFilename": still_rel,
                },
                "receivedAt": "2024-05-28T12:05:00Z",
            }
        ]
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    clip_landmarks = [[float(i), float(i), float(i)] for i in range(42)]
    clip_frame = {"landmarks": clip_landmarks}
    still_landmarks = [[float(i) + 0.5, float(i) + 0.5, float(i) + 0.5] for i in range(42)]
    still_frame = {"landmarks": still_landmarks}

    monkeypatch.setattr(module, "extract_landmarks_from_clip", lambda _path: [clip_frame])
    monkeypatch.setattr(module, "extract_landmarks_from_still", lambda _path: still_frame)

    captured = {}

    def fake_flatten(frames: list[dict]):
        captured["frames"] = frames
        return [[0.0, 0.0, 0.0] for _ in range(42)]

    monkeypatch.setattr(module, "flatten_landmarks_mean", fake_flatten)

    samples, stats = module.build_samples_from_manifest(module.MANIFEST_PATH)

    assert len(samples) == 1
    assert stats["cache_writes"] == 1
    assert captured["frames"] is not None
    assert len(captured["frames"]) == 2
    assert clip_frame in captured["frames"]
    assert still_frame in captured["frames"]
