import importlib
import json
from pathlib import Path

FEATURE_CONTRACT = {
    "version": "wrist_relative_max_abs_v1",
    "normalization": "wrist_relative_max_abs",
    "handOrder": ["Left", "Right"],
    "missingHandStrategy": "zero_pad",
    "pointsPerHand": 21,
    "coordinatesPerPoint": 3,
    "vectorLength": 126,
}


def _build_frame(index: int) -> dict:
    points = []
    for landmark_index in range(42):
        base = ((index + landmark_index) % 20) / 100.0
        points.append([base, min(base + 0.05, 0.95), base / 2.0])
    return {
        "timestampMs": index * 33,
        "landmarks": points,
    }


def _write_bundle(
    data_dir: Path,
    bundle_id: str,
    label: str,
    profile_id: str,
    *,
    valid_contract: bool = True,
    write_landmarks: bool = True,
) -> dict:
    bundle_rel = Path("training_uploads") / profile_id / bundle_id
    bundle_dir = data_dir / bundle_rel
    bundle_dir.mkdir(parents=True, exist_ok=True)
    if write_landmarks:
        (bundle_dir / "landmarks.json").write_text(
            json.dumps({"frames": [_build_frame(index) for index in range(30)]}),
            encoding="utf-8",
        )
    metadata = {
        "label": label,
        "profileId": profile_id,
        "featureContract": FEATURE_CONTRACT if valid_contract else {"version": "old-contract"},
        "recording": {
            "frameCount": 30,
            "usableFrameCount": 30,
            "clipDurationMs": 990,
        },
        "modalities": {
            "hands": {"coverage": 1.0},
            "pose": {"coverage": 0.5},
            "face": {"coverage": 0.5},
            "nonManual": {"coverage": 0.0},
        },
    }
    return {
        "id": bundle_id,
        "profileId": profile_id,
        "label": label,
        "storage": {
            "directory": str(bundle_rel),
            "files": ["landmarks.json"],
        },
        "metadata": metadata,
    }


def _load_module(monkeypatch, data_dir: Path, manifest_path: Path):
    monkeypatch.setenv("MLP_DATA_DIR", str(data_dir))
    monkeypatch.setenv("MLP_MANIFEST_PATH", str(manifest_path))
    monkeypatch.setenv("MLP_BUNDLE_LANDMARK_POLICY", "bundle_only")
    return importlib.reload(importlib.import_module("amyserver_tools.evaluate_dataset_readiness"))


def test_empty_manifest_is_blocked(monkeypatch, tmp_path: Path) -> None:
    data_dir = tmp_path / "data"
    manifest_path = data_dir / "datasets" / "training_manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    module = _load_module(monkeypatch, data_dir, manifest_path)
    manifest_path.write_text(json.dumps({"entries": []}), encoding="utf-8")

    summary, missing_samples = module.build_dataset_readiness_summary(
        manifest_path=manifest_path,
        data_dir=data_dir,
        shots=[1, 3],
        seeds=[42, 1337],
        min_profiles=2,
        min_labels=2,
    )

    assert summary["protocol"] == "dataset_readiness_v1"
    assert summary["status"] == "blocked"
    assert summary["blockers"] == [
        "Trainings-Manifest ist vorhanden, enthält aber keine Einträge."
    ]
    assert missing_samples["shots"] == [{"shot": 1, "labels": []}, {"shot": 3, "labels": []}]


def test_one_accepted_profile_is_blocked(monkeypatch, tmp_path: Path) -> None:
    data_dir = tmp_path / "data"
    manifest_path = data_dir / "datasets" / "training_manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    module = _load_module(monkeypatch, data_dir, manifest_path)
    manifest_path.write_text(
        json.dumps(
            {
                "entries": [
                    _write_bundle(data_dir, "bundle-1", "HALLO", "profile-a"),
                    _write_bundle(data_dir, "bundle-2", "BITTE", "profile-a"),
                ]
            }
        ),
        encoding="utf-8",
    )

    summary, _missing_samples = module.build_dataset_readiness_summary(
        manifest_path=manifest_path,
        data_dir=data_dir,
        shots=[1],
        seeds=[42, 1337],
        min_profiles=2,
        min_labels=2,
    )

    assert summary["status"] == "blocked"
    assert summary["holdout"]["ready"] is False
    assert summary["holdout"]["accepted_profile_count"] == 1


def test_missing_landmarks_are_rejected_and_reported(monkeypatch, tmp_path: Path) -> None:
    data_dir = tmp_path / "data"
    manifest_path = data_dir / "datasets" / "training_manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    module = _load_module(monkeypatch, data_dir, manifest_path)
    manifest_path.write_text(
        json.dumps(
            {
                "entries": [
                    _write_bundle(data_dir, "bundle-good-1", "HALLO", "profile-a"),
                    _write_bundle(
                        data_dir,
                        "bundle-missing-landmarks",
                        "BITTE",
                        "profile-b",
                        write_landmarks=False,
                    ),
                ]
            }
        ),
        encoding="utf-8",
    )

    summary, _missing_samples = module.build_dataset_readiness_summary(
        manifest_path=manifest_path,
        data_dir=data_dir,
        shots=[1],
        seeds=[42],
        min_profiles=2,
        min_labels=1,
    )

    assert summary["manifest"]["missing_landmark_bundle_count"] == 1
    assert summary["manifest"]["rejected_bundle_count"] == 1
    assert summary["rejected_bundles"][0]["issue_codes"] == [
        "missing_landmarks",
        "no_frames_loaded",
    ]


def test_output_files_include_missing_samples(monkeypatch, tmp_path: Path) -> None:
    data_dir = tmp_path / "data"
    output_dir = tmp_path / "results"
    manifest_path = data_dir / "datasets" / "training_manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    module = _load_module(monkeypatch, data_dir, manifest_path)
    manifest_path.write_text(
        json.dumps(
            {
                "entries": [
                    _write_bundle(data_dir, "bundle-1", "HALLO", "profile-a"),
                    _write_bundle(data_dir, "bundle-2", "HALLO", "profile-b"),
                    _write_bundle(data_dir, "bundle-3", "BITTE", "profile-a"),
                    _write_bundle(data_dir, "bundle-4", "BITTE", "profile-b"),
                ]
            }
        ),
        encoding="utf-8",
    )

    summary, missing_samples = module.build_dataset_readiness_summary(
        manifest_path=manifest_path,
        data_dir=data_dir,
        shots=[1, 3],
        seeds=[42, 1337],
        min_profiles=2,
        min_labels=2,
    )
    summary["artifact_paths"] = module._write_outputs(output_dir, summary, missing_samples)

    assert (output_dir / "summary.json").exists()
    assert (output_dir / "summary.md").exists()
    assert (output_dir / "latest.json").exists()
    assert (output_dir / "latest.md").exists()
    assert (output_dir / "missing_samples.json").exists()
    written_missing_samples = json.loads((output_dir / "missing_samples.json").read_text(encoding="utf-8"))
    assert written_missing_samples["protocol"] == "dataset_readiness_v1"
    assert written_missing_samples["shots"][1]["shot"] == 3


def test_min_profile_and_label_arguments_affect_status(monkeypatch, tmp_path: Path) -> None:
    data_dir = tmp_path / "data"
    manifest_path = data_dir / "datasets" / "training_manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    module = _load_module(monkeypatch, data_dir, manifest_path)
    manifest_path.write_text(
        json.dumps(
            {
                "entries": [
                    _write_bundle(data_dir, "bundle-1", "HALLO", "profile-a"),
                    _write_bundle(data_dir, "bundle-2", "HALLO", "profile-b"),
                    _write_bundle(data_dir, "bundle-3", "BITTE", "profile-a"),
                    _write_bundle(data_dir, "bundle-4", "BITTE", "profile-b"),
                ]
            }
        ),
        encoding="utf-8",
    )

    ready_summary, _ = module.build_dataset_readiness_summary(
        manifest_path=manifest_path,
        data_dir=data_dir,
        shots=[1],
        seeds=[42],
        min_profiles=2,
        min_labels=2,
    )
    blocked_summary, _ = module.build_dataset_readiness_summary(
        manifest_path=manifest_path,
        data_dir=data_dir,
        shots=[1],
        seeds=[42],
        min_profiles=3,
        min_labels=3,
    )

    assert ready_summary["status"] == "ready"
    assert blocked_summary["status"] == "blocked"
    assert blocked_summary["thresholds"]["min_profiles"] == 3
    assert blocked_summary["thresholds"]["min_labels"] == 3


def test_shot_readiness_catches_skewed_profile_distribution(monkeypatch, tmp_path: Path) -> None:
    data_dir = tmp_path / "data"
    manifest_path = data_dir / "datasets" / "training_manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    module = _load_module(monkeypatch, data_dir, manifest_path)
    manifest_path.write_text(
        json.dumps(
            {
                "entries": [
                    _write_bundle(data_dir, "bundle-a1", "HALLO", "profile-a"),
                    _write_bundle(data_dir, "bundle-a2", "HALLO", "profile-a"),
                    _write_bundle(data_dir, "bundle-a3", "HALLO", "profile-a"),
                    _write_bundle(data_dir, "bundle-a4", "HALLO", "profile-a"),
                    _write_bundle(data_dir, "bundle-b1", "HALLO", "profile-b"),
                    _write_bundle(data_dir, "bundle-c1", "BITTE", "profile-a"),
                    _write_bundle(data_dir, "bundle-c2", "BITTE", "profile-a"),
                    _write_bundle(data_dir, "bundle-c3", "BITTE", "profile-a"),
                    _write_bundle(data_dir, "bundle-c4", "BITTE", "profile-a"),
                    _write_bundle(data_dir, "bundle-d1", "BITTE", "profile-b"),
                ]
            }
        ),
        encoding="utf-8",
    )

    summary, missing_samples = module.build_dataset_readiness_summary(
        manifest_path=manifest_path,
        data_dir=data_dir,
        shots=[3],
        seeds=[42, 1337],
        min_profiles=2,
        min_labels=1,
    )

    assert summary["shots"][0]["ready"] is False
    assert summary["shots"][0]["ready_for_some_seeds"] is True
    hello_gap = next(
        item
        for item in missing_samples["shots"][0]["labels"]
        if item["label"] == "hallo"
    )
    assert hello_gap["ready_for_all_seeds"] is False
    assert hello_gap["ready_for_some_seeds"] is True
    assert hello_gap["ready_seed_count"] == 1
