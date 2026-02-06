import importlib
import json
from pathlib import Path


def test_build_samples_from_manifest_uses_video_extension(monkeypatch, tmp_path):
    data_dir = tmp_path / "data"
    manifest_path = data_dir / "datasets" / "training_manifest.json"
    monkeypatch.setenv("MLP_DATA_DIR", str(data_dir))
    monkeypatch.setenv("MLP_MANIFEST_PATH", str(manifest_path))
    monkeypatch.setenv("MLP_BUNDLE_LANDMARK_POLICY", "prefer_bundle")

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
    assert len(samples) >= 1
    assert stats["cache_writes"] == 1
    assert stats["cache_hits"] == 0
    # The last samples should be the actual label
    assert any(s.label == "HALLO" for s in samples)


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

    still_landmarks = [[float(i)/100.0, (float(i) + 0.1)/100.0, (float(i) + 0.2)/100.0] for i in range(42)]
    fake_frame = {"landmarks": still_landmarks}

    monkeypatch.setattr(module, "extract_landmarks_from_clip", lambda _path: [])
    monkeypatch.setattr(module, "extract_landmarks_from_still", lambda _path: fake_frame)

    samples, stats = module.build_samples_from_manifest(module.MANIFEST_PATH)

    assert stats["cache_hits"] == 0
    assert len(samples) >= 1
    # Find a sample that isn't _NULL_
    sign_samples = [s for s in samples if s.label == "BITTE"]
    assert sign_samples
    # In sliding window, landmarks are flattened (WINDOW_SIZE * 1629)
    from amyserver_tools.train_mlp import WINDOW_FEATURE_SIZE
    assert len(sign_samples[0].landmarks) == WINDOW_FEATURE_SIZE


def test_build_samples_from_manifest_appends_still_to_clip(monkeypatch, tmp_path):
    data_dir = tmp_path / "data"
    manifest_path = data_dir / "datasets" / "training_manifest.json"
    monkeypatch.setenv("MLP_DATA_DIR", str(data_dir))
    monkeypatch.setenv("MLP_MANIFEST_PATH", str(manifest_path))
    monkeypatch.setenv("MLP_BUNDLE_LANDMARK_POLICY", "prefer_bundle")

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

    clip_landmarks = [[0.1, 0.1, 0.1] for _ in range(42)]
    clip_frame = {"landmarks": clip_landmarks}
    still_landmarks = [[0.2, 0.2, 0.2] for _ in range(42)]
    still_frame = {"landmarks": still_landmarks}

    monkeypatch.setattr(module, "extract_landmarks_from_clip", lambda _path: [clip_frame])
    monkeypatch.setattr(module, "extract_landmarks_from_still", lambda _path: still_frame)

    samples, stats = module.build_samples_from_manifest(module.MANIFEST_PATH)

    assert len(samples) >= 1
    # Check that we have HALLO samples
    sign_samples = [s for s in samples if s.label == "HALLO"]
    assert sign_samples

    # Verify cache write happened (it should when frames come from clip)
    assert stats["cache_writes"] == 1


def test_still_frames_are_included_in_samples(monkeypatch, tmp_path):
    """Verify that still frames are included in the sequence used for windows."""
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
                "storage": {
                    "directory": str(bundle_rel),
                    "files": [clip_rel, still_rel],
                    "clip": clip_rel,
                    "still": still_rel,
                },
                "metadata": {
                    "label": "TEST",
                    "clipFilename": clip_rel,
                    "stillFilename": still_rel,
                }
            }
        ]
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    # Use realistic landmarks where wrist (0) is different from others
    clip_landmarks = [[0.1 + i/100.0, 0.1, 0.1] for i in range(42)]
    clip_frame = {"landmarks": clip_landmarks}
    still_landmarks = [[0.9 - i/100.0, 0.9, 0.9] for i in range(42)]
    still_frame = {"landmarks": still_landmarks}

    monkeypatch.setattr(module, "extract_landmarks_from_clip", lambda _path: [clip_frame])
    monkeypatch.setattr(module, "extract_landmarks_from_still", lambda _path: still_frame)

    samples, _stats = module.build_samples_from_manifest(module.MANIFEST_PATH)

    assert len(samples) >= 1
    sign_samples = [s for s in samples if s.label == "TEST"]
    assert sign_samples

    # In the new sliding window logic, if we have 1 clip frame + 1 still frame,
    # the window (size 30) will be filled by repeating the last frame (still frame).
    # So the landmark values should eventually be dominated by still frame values.
    assert any(val != 0.0 for val in sign_samples[0].landmarks)


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
                "storage": {
                    "directory": str(bundle_rel),
                    "files": [clip_rel, still_rel],
                    "clip": clip_rel,
                    "still": still_rel,
                },
                "metadata": {
                    "label": "TEST",
                    "clipFilename": clip_rel,
                    "stillFilename": still_rel,
                }
            }
        ]
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    # Mock extract functions to ensure they're not called when using cache
    extract_still_called = []

    def mock_extract_still(_path):
        extract_still_called.append(True)
        return {"landmarks": still_landmarks}

    monkeypatch.setattr(module, "extract_landmarks_from_still", mock_extract_still)

    samples, stats = module.build_samples_from_manifest(module.MANIFEST_PATH)

    # Verify cache was used
    assert stats["cache_hits"] == 1
    assert stats["cache_misses"] == 0
    assert stats["cache_writes"] == 0

    # Verify extract_landmarks_from_still was NOT called (because cache was used)
    assert len(extract_still_called) == 0, "Still extraction should not be called when using cache"

    # Verify we have samples
    assert len(samples) >= 1



def test_build_samples_bundle_only_does_not_extract_clip_without_landmarks(monkeypatch, tmp_path):
    data_dir = tmp_path / "data"
    manifest_path = data_dir / "datasets" / "training_manifest.json"
    monkeypatch.setenv("MLP_DATA_DIR", str(data_dir))
    monkeypatch.setenv("MLP_MANIFEST_PATH", str(manifest_path))
    monkeypatch.setenv("MLP_BUNDLE_LANDMARK_POLICY", "bundle_only")

    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))

    bundle_rel = Path("training_uploads/unassigned/bundle-policy-1")
    bundle_dir = data_dir / bundle_rel
    bundle_dir.mkdir(parents=True)

    clip_rel = "clip.webm"
    clip_path = bundle_dir / clip_rel
    clip_path.write_bytes(b"fake-webm-bytes")

    manifest = {
        "entries": [
            {
                "id": "bundle-policy-1",
                "profileId": None,
                "label": "HALLO",
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
            }
        ]
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    calls = {"count": 0}

    def fake_extract(_path: Path):
        calls["count"] += 1
        return [{"landmarks": [[0.1, 0.1, 0.1] for _ in range(42)]}]

    monkeypatch.setattr(module, "extract_landmarks_from_clip", fake_extract)

    samples, stats = module.build_samples_from_manifest(module.MANIFEST_PATH, skip_examples=True)

    assert calls["count"] == 0
    assert stats["bundle_landmark_policy"] == "bundle_only"
    assert stats["bundle_missing_landmarks"] == 1
    assert stats["bundle_fallback_extractions"] == 0
    assert not any(s.label == "HALLO" for s in samples)


def test_build_samples_prefer_bundle_extracts_clip_without_landmarks(monkeypatch, tmp_path):
    data_dir = tmp_path / "data"
    manifest_path = data_dir / "datasets" / "training_manifest.json"
    monkeypatch.setenv("MLP_DATA_DIR", str(data_dir))
    monkeypatch.setenv("MLP_MANIFEST_PATH", str(manifest_path))
    monkeypatch.setenv("MLP_BUNDLE_LANDMARK_POLICY", "prefer_bundle")

    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))

    bundle_rel = Path("training_uploads/unassigned/bundle-policy-2")
    bundle_dir = data_dir / bundle_rel
    bundle_dir.mkdir(parents=True)

    clip_rel = "clip.webm"
    clip_path = bundle_dir / clip_rel
    clip_path.write_bytes(b"fake-webm-bytes")

    manifest = {
        "entries": [
            {
                "id": "bundle-policy-2",
                "profileId": None,
                "label": "HALLO",
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
            }
        ]
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    calls = {"count": 0}

    def fake_extract(path: Path):
        calls["count"] += 1
        assert path == clip_path
        return [{"landmarks": [[0.1, 0.1, 0.1] for _ in range(42)]}]

    monkeypatch.setattr(module, "extract_landmarks_from_clip", fake_extract)

    samples, stats = module.build_samples_from_manifest(module.MANIFEST_PATH, skip_examples=True)

    assert calls["count"] == 1
    assert stats["bundle_landmark_policy"] == "prefer_bundle"
    assert stats["bundle_missing_landmarks"] == 0
    assert stats["bundle_fallback_extractions"] == 1
    assert any(s.label == "HALLO" for s in samples)


def test_build_samples_from_manifest_returns_policy_stats_when_manifest_missing(monkeypatch, tmp_path):
    data_dir = tmp_path / "data"
    manifest_path = data_dir / "datasets" / "missing_training_manifest.json"
    monkeypatch.setenv("MLP_DATA_DIR", str(data_dir))
    monkeypatch.setenv("MLP_MANIFEST_PATH", str(manifest_path))
    monkeypatch.setenv("MLP_BUNDLE_LANDMARK_POLICY", "bundle_only")

    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))

    samples, stats = module.build_samples_from_manifest(module.MANIFEST_PATH, skip_examples=True)

    assert samples == []
    assert stats["entries"] == 0
    assert stats["bundle_fallback_extractions"] == 0
    assert stats["bundle_missing_landmarks"] == 0
    assert stats["bundle_landmark_policy"] == "bundle_only"
    assert stats["modality_counts"] == {"hands": 0, "pose": 0, "face": 0}
    assert stats["modality_sample_total"] == 0


def test_build_samples_prefer_bundle_counts_missing_when_clip_extraction_returns_no_frames(monkeypatch, tmp_path):
    data_dir = tmp_path / "data"
    manifest_path = data_dir / "datasets" / "training_manifest.json"
    monkeypatch.setenv("MLP_DATA_DIR", str(data_dir))
    monkeypatch.setenv("MLP_MANIFEST_PATH", str(manifest_path))
    monkeypatch.setenv("MLP_BUNDLE_LANDMARK_POLICY", "prefer_bundle")

    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))

    bundle_rel = Path("training_uploads/unassigned/bundle-policy-3")
    bundle_dir = data_dir / bundle_rel
    bundle_dir.mkdir(parents=True)

    clip_rel = "clip.webm"
    clip_path = bundle_dir / clip_rel
    clip_path.write_bytes(b"fake-webm-bytes")

    manifest = {
        "entries": [
            {
                "id": "bundle-policy-3",
                "profileId": None,
                "label": "HALLO",
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
            }
        ]
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    def fake_extract(path: Path):
        assert path == clip_path
        return []

    monkeypatch.setattr(module, "extract_landmarks_from_clip", fake_extract)

    samples, stats = module.build_samples_from_manifest(module.MANIFEST_PATH, skip_examples=True)

    assert samples == []
    assert stats["bundle_fallback_extractions"] == 0
    assert stats["bundle_missing_landmarks"] == 1


def test_create_empty_training_stats_contains_all_expected_keys(monkeypatch, tmp_path):
    data_dir = tmp_path / "data"
    manifest_path = data_dir / "datasets" / "missing_training_manifest.json"
    monkeypatch.setenv("MLP_DATA_DIR", str(data_dir))
    monkeypatch.setenv("MLP_MANIFEST_PATH", str(manifest_path))
    monkeypatch.setenv("MLP_BUNDLE_LANDMARK_POLICY", "bundle_only")

    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))

    stats = module.create_empty_training_stats()

    assert stats["entries"] == 0
    assert stats["cache_hits"] == 0
    assert stats["cache_misses"] == 0
    assert stats["cache_writes"] == 0
    assert stats["modality_counts"] == {"hands": 0, "pose": 0, "face": 0}
    assert stats["modality_sample_total"] == 0
    assert stats["bundle_fallback_extractions"] == 0
    assert stats["bundle_missing_landmarks"] == 0
    assert stats["bundle_landmark_policy"] == "bundle_only"


def test_load_frame_list_for_bundle_uses_cache_without_still_duplication(monkeypatch, tmp_path):
    data_dir = tmp_path / "data"
    monkeypatch.setenv("MLP_DATA_DIR", str(data_dir))
    monkeypatch.setenv("MLP_BUNDLE_LANDMARK_POLICY", "bundle_only")

    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))

    bundle_dir = data_dir / "training_uploads" / "unassigned" / "bundle-helper"
    bundle_dir.mkdir(parents=True)

    landmarks_path = bundle_dir / "landmarks.json"
    landmarks_path.write_text(json.dumps({"frames": [{"landmarks": [[0.0, 0.0, 0.0] for _ in range(42)]}]}), encoding="utf-8")

    cache_path = bundle_dir / "landmarks_cached.json"
    cache_path.write_text(
        json.dumps({"frames": [{"landmarks": [[0.1, 0.1, 0.1] for _ in range(42)]}]}),
        encoding="utf-8",
    )

    still_path = bundle_dir / "still.jpg"
    still_path.write_bytes(b"fake-still")

    called = {"still": 0}

    def fake_still(_path):
        called["still"] += 1
        return {"landmarks": [[0.9, 0.9, 0.9] for _ in range(42)]}

    monkeypatch.setattr(module, "extract_landmarks_from_still", fake_still)

    frame_list, stats = module.load_frame_list_for_bundle(
        landmarks_path,
        cache_path,
        clip_path=None,
        still_path=still_path,
    )

    assert len(frame_list) == 1
    assert stats["cache_hits"] == 1
    assert stats["cache_misses"] == 0
    assert stats["cache_writes"] == 0
    assert stats["bundle_fallback_extractions"] == 0
    assert stats["bundle_missing_landmarks"] == 0
    assert called["still"] == 0


def test_load_audio_features_for_bundle_returns_none_without_file(monkeypatch, tmp_path):
    data_dir = tmp_path / "data"
    manifest_path = data_dir / "datasets" / "training_manifest.json"
    monkeypatch.setenv("MLP_DATA_DIR", str(data_dir))
    monkeypatch.setenv("MLP_MANIFEST_PATH", str(manifest_path))

    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))

    features, metadata = module.load_audio_features_for_bundle(
        audio_path=None,
        label="HALLO",
        profile_id=None,
    )

    assert features is None
    assert metadata is None


def test_load_audio_features_for_bundle_returns_none_when_preprocessing_unavailable(monkeypatch, tmp_path):
    data_dir = tmp_path / "data"
    manifest_path = data_dir / "datasets" / "training_manifest.json"
    monkeypatch.setenv("MLP_DATA_DIR", str(data_dir))
    monkeypatch.setenv("MLP_MANIFEST_PATH", str(manifest_path))

    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))

    audio_path = data_dir / "training_uploads" / "unassigned" / "audio.wav"
    audio_path.parent.mkdir(parents=True)
    audio_path.write_bytes(b"fake-audio")

    monkeypatch.setattr(module, "AUDIO_PREPROCESSING_AVAILABLE", False)

    features, metadata = module.load_audio_features_for_bundle(
        audio_path=audio_path,
        label="HALLO",
        profile_id="child-1",
    )

    assert features is None
    assert metadata is None


def test_load_audio_features_for_bundle_returns_none_when_dependencies_unavailable(monkeypatch, tmp_path):
    data_dir = tmp_path / "data"
    manifest_path = data_dir / "datasets" / "training_manifest.json"
    monkeypatch.setenv("MLP_DATA_DIR", str(data_dir))
    monkeypatch.setenv("MLP_MANIFEST_PATH", str(manifest_path))

    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))

    audio_path = data_dir / "training_uploads" / "unassigned" / "audio.wav"
    audio_path.parent.mkdir(parents=True)
    audio_path.write_bytes(b"fake-audio")

    monkeypatch.setattr(module, "AUDIO_PREPROCESSING_AVAILABLE", True)
    module._audio_dependencies_available.cache_clear()
    monkeypatch.setattr(module, "check_audio_dependencies", lambda: False)

    features, metadata = module.load_audio_features_for_bundle(
        audio_path=audio_path,
        label="HALLO",
        profile_id="child-1",
    )

    assert features is None
    assert metadata is None


def test_load_audio_features_for_bundle_checks_dependencies_once(monkeypatch, tmp_path):
    data_dir = tmp_path / "data"
    manifest_path = data_dir / "datasets" / "training_manifest.json"
    monkeypatch.setenv("MLP_DATA_DIR", str(data_dir))
    monkeypatch.setenv("MLP_MANIFEST_PATH", str(manifest_path))

    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))

    audio_path = data_dir / "training_uploads" / "unassigned" / "audio.wav"
    audio_path.parent.mkdir(parents=True)
    audio_path.write_bytes(b"fake-audio")

    calls = {"dependency": 0}

    def fake_check_audio_dependencies():
        calls["dependency"] += 1
        return True

    monkeypatch.setattr(module, "AUDIO_PREPROCESSING_AVAILABLE", True)
    module._audio_dependencies_available.cache_clear()
    monkeypatch.setattr(module, "check_audio_dependencies", fake_check_audio_dependencies)
    monkeypatch.setattr(
        module,
        "preprocess_audio_for_training",
        lambda *_args, **_kwargs: {"features": {"mfcc": [0.1]}},
    )

    first_features, first_metadata = module.load_audio_features_for_bundle(
        audio_path=audio_path,
        label="HALLO",
        profile_id="child-1",
    )
    second_features, second_metadata = module.load_audio_features_for_bundle(
        audio_path=audio_path,
        label="HALLO",
        profile_id="child-1",
    )

    assert calls["dependency"] == 1
    assert first_features == {"mfcc": [0.1]}
    assert first_metadata == {
        "duration_ms": 0,
        "has_speech": False,
        "energy": 0.0,
        "sample_rate": 16000,
    }
    assert second_features == {"mfcc": [0.1]}
    assert second_metadata == {
        "duration_ms": 0,
        "has_speech": False,
        "energy": 0.0,
        "sample_rate": 16000,
    }


def test_audio_dependencies_available_cache_can_be_cleared(monkeypatch, tmp_path):
    data_dir = tmp_path / "data"
    manifest_path = data_dir / "datasets" / "training_manifest.json"
    monkeypatch.setenv("MLP_DATA_DIR", str(data_dir))
    monkeypatch.setenv("MLP_MANIFEST_PATH", str(manifest_path))

    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))

    calls = {"dependency": 0}

    def fake_check_audio_dependencies():
        calls["dependency"] += 1
        return True

    monkeypatch.setattr(module, "AUDIO_PREPROCESSING_AVAILABLE", True)
    monkeypatch.setattr(module, "check_audio_dependencies", fake_check_audio_dependencies)
    module._audio_dependencies_available.cache_clear()

    assert module._audio_dependencies_available() is True
    assert module._audio_dependencies_available() is True
    assert calls["dependency"] == 1

    module._audio_dependencies_available.cache_clear()
    assert module._audio_dependencies_available() is True
    assert calls["dependency"] == 2


def test_load_audio_features_for_bundle_returns_features_when_preprocessing_succeeds(monkeypatch, tmp_path):
    data_dir = tmp_path / "data"
    manifest_path = data_dir / "datasets" / "training_manifest.json"
    monkeypatch.setenv("MLP_DATA_DIR", str(data_dir))
    monkeypatch.setenv("MLP_MANIFEST_PATH", str(manifest_path))

    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))

    audio_path = data_dir / "training_uploads" / "unassigned" / "audio.wav"
    audio_path.parent.mkdir(parents=True)
    audio_path.write_bytes(b"fake-audio")

    monkeypatch.setattr(module, "AUDIO_PREPROCESSING_AVAILABLE", True)
    module._audio_dependencies_available.cache_clear()
    monkeypatch.setattr(module, "check_audio_dependencies", lambda: True)
    monkeypatch.setattr(
        module,
        "preprocess_audio_for_training",
        lambda *_args, **_kwargs: {
            "features": {"mfcc": [0.1, 0.2, 0.3]},
            "duration_ms": 500,
            "has_speech": True,
            "energy": 0.4,
            "sample_rate": 22050,
        },
    )

    features, metadata = module.load_audio_features_for_bundle(
        audio_path=audio_path,
        label="HALLO",
        profile_id="child-1",
    )

    assert features == {"mfcc": [0.1, 0.2, 0.3]}
    assert metadata == {
        "duration_ms": 500,
        "has_speech": True,
        "energy": 0.4,
        "sample_rate": 22050,
    }
