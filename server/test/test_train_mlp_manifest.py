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


def test_still_frames_have_higher_weight_than_video_frames(monkeypatch, tmp_path):
    """Verify that still frames are marked with higher weight for weighted averaging."""
    data_dir = tmp_path / "data"
    manifest_path = data_dir / "datasets" / "training_manifest.json"
    monkeypatch.setenv("MLP_DATA_DIR", str(data_dir))
    monkeypatch.setenv("MLP_MANIFEST_PATH", str(manifest_path))

    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))

    bundle_rel = Path("training_uploads/unassigned/bundle-weighted")
    bundle_dir = data_dir / bundle_rel
    bundle_dir.mkdir(parents=True)

    clip_rel = "clip.mp4"
    still_rel = "still.jpg"
    (bundle_dir / clip_rel).write_bytes(b"fake-video")
    (bundle_dir / still_rel).write_bytes(b"fake-still")

    manifest = {
        "entries": [
            {
                "id": "bundle-weighted",
                "profileId": None,
                "label": "TEST",
                "capturedAt": "2024-05-28T12:03:11Z",
                "storage": {
                    "directory": str(bundle_rel),
                    "bundle": str(bundle_rel / "bundle.zip"),
                    "files": [clip_rel, still_rel],
                    "clip": clip_rel,
                    "still": still_rel,
                },
                "metadata": {
                    "label": "TEST",
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

    # Video frames have landmark values of 0.0
    clip_landmarks = [[0.0, 0.0, 0.0] for _ in range(42)]
    clip_frame = {"landmarks": clip_landmarks}
    
    # Still frame has landmark values of 1.0
    still_landmarks = [[1.0, 1.0, 1.0] for _ in range(42)]
    still_frame = {"landmarks": still_landmarks}

    monkeypatch.setattr(module, "extract_landmarks_from_clip", lambda _path: [clip_frame])
    monkeypatch.setattr(module, "extract_landmarks_from_still", lambda _path: still_frame)

    samples, stats = module.build_samples_from_manifest(module.MANIFEST_PATH)

    assert len(samples) == 1
    
    # Verify the averaged landmarks are closer to still frame (1.0) than video frame (0.0)
    # With default weight of 10.0, the weighted average should be:
    # (0.0 * 1.0 + 1.0 * 10.0) / (1.0 + 10.0) = 10.0 / 11.0 ≈ 0.909
    sample_landmarks = samples[0].landmarks
    first_landmark_value = sample_landmarks[0][0]  # x coordinate of first landmark
    
    # The value should be much closer to 1.0 (still) than 0.0 (video)
    assert first_landmark_value > 0.8, (
        f"Weighted average should be dominated by still frame. "
        f"Expected > 0.8, got {first_landmark_value}"
    )
    
    # Verify it's approximately the expected weighted average
    expected_avg = module.STILL_FRAME_WEIGHT / (1.0 + module.STILL_FRAME_WEIGHT)
    assert abs(first_landmark_value - expected_avg) < 0.01, (
        f"Weighted average calculation incorrect. "
        f"Expected {expected_avg:.3f}, got {first_landmark_value:.3f}"
    )


def test_cached_frames_do_not_duplicate_still_frame(monkeypatch, tmp_path):
    """Verify that still frames are not appended when loading from cache."""
    data_dir = tmp_path / "data"
    manifest_path = data_dir / "datasets" / "training_manifest.json"
    monkeypatch.setenv("MLP_DATA_DIR", str(data_dir))
    monkeypatch.setenv("MLP_MANIFEST_PATH", str(manifest_path))

    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))

    bundle_rel = Path("training_uploads/unassigned/bundle-cache-test")
    bundle_dir = data_dir / bundle_rel
    bundle_dir.mkdir(parents=True)

    clip_rel = "clip.mp4"
    still_rel = "still.jpg"
    (bundle_dir / clip_rel).write_bytes(b"fake-video")
    (bundle_dir / still_rel).write_bytes(b"fake-still")

    # Create a cache file that already contains the weighted still frame
    cache_path = bundle_dir / "landmarks_cached.json"
    clip_landmarks = [[0.0, 0.0, 0.0] for _ in range(42)]
    still_landmarks = [[1.0, 1.0, 1.0] for _ in range(42)]
    cached_frames = [
        {"landmarks": clip_landmarks},
        {"landmarks": still_landmarks, "weight": module.STILL_FRAME_WEIGHT},
    ]
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps({"frames": cached_frames}), encoding="utf-8")

    manifest = {
        "entries": [
            {
                "id": "bundle-cache-test",
                "profileId": None,
                "label": "TEST",
                "capturedAt": "2024-05-28T12:03:11Z",
                "storage": {
                    "directory": str(bundle_rel),
                    "bundle": str(bundle_rel / "bundle.zip"),
                    "files": [clip_rel, still_rel],
                    "clip": clip_rel,
                    "still": still_rel,
                },
                "metadata": {
                    "label": "TEST",
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

    # Mock extract functions to ensure they're not called when using cache
    extract_clip_called = []
    extract_still_called = []

    def mock_extract_clip(_path):
        extract_clip_called.append(True)
        return []

    def mock_extract_still(_path):
        extract_still_called.append(True)
        return {"landmarks": still_landmarks}

    monkeypatch.setattr(module, "extract_landmarks_from_clip", mock_extract_clip)
    monkeypatch.setattr(module, "extract_landmarks_from_still", mock_extract_still)

    samples, stats = module.build_samples_from_manifest(module.MANIFEST_PATH)

    # Verify cache was used
    assert stats["cache_hits"] == 1
    assert stats["cache_misses"] == 0
    assert stats["cache_writes"] == 0

    # Verify extract_landmarks_from_still was NOT called (because cache was used)
    assert len(extract_still_called) == 0, "Still extraction should not be called when using cache"

    # Verify the sample uses the cached weighted average (not doubled still frame)
    # With 1 video (0.0) + 1 still (1.0, weight=10), the average should be 10/11 ≈ 0.909
    assert len(samples) == 1
    first_landmark_value = samples[0].landmarks[0][0]
    expected_avg = module.STILL_FRAME_WEIGHT / (1.0 + module.STILL_FRAME_WEIGHT)
    
    # If still frame was doubled, we'd have 1 video + 2 stills, giving:
    # (0.0 * 1.0 + 1.0 * 10.0 + 1.0 * 10.0) / 21.0 = 0.952
    # With correct behavior (no doubling), we get 0.909
    assert abs(first_landmark_value - expected_avg) < 0.01, (
        f"Weighted average suggests still frame may have been doubled. "
        f"Expected {expected_avg:.3f}, got {first_landmark_value:.3f}"
    )

