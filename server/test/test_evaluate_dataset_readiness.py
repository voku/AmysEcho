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
) -> dict:
    bundle_rel = Path("training_uploads") / profile_id / bundle_id
    bundle_dir = data_dir / bundle_rel
    bundle_dir.mkdir(parents=True, exist_ok=True)
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


def test_build_dataset_readiness_summary_reports_partial_readiness(monkeypatch, tmp_path: Path) -> None:
    data_dir = tmp_path / "data"
    manifest_path = data_dir / "datasets" / "training_manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("MLP_DATA_DIR", str(data_dir))
    monkeypatch.setenv("MLP_MANIFEST_PATH", str(manifest_path))
    monkeypatch.setenv("MLP_BUNDLE_LANDMARK_POLICY", "bundle_only")

    module = importlib.reload(importlib.import_module("amyserver_tools.evaluate_dataset_readiness"))

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

    summary = module.build_dataset_readiness_summary(
        manifest_path=manifest_path,
        data_dir=data_dir,
        shots=[1, 3, 5, 10],
    )

    assert summary["status"] == "partial"
    assert summary["manifest"]["accepted_bundle_count"] == 4
    assert summary["holdout"]["ready"] is True
    assert summary["shots"][0] == {
        "shot": 1,
        "ready": True,
        "ready_label_count": 2,
        "total_label_count": 2,
        "missing_labels": [],
    }
    assert summary["shots"][1]["shot"] == 3
    assert summary["shots"][1]["ready"] is False
    assert summary["shots"][1]["missing_labels"][0] == {
        "label": "hallo",
        "missing_accepted_bundles": 2,
        "missing_profiles": 0,
    }
    assert summary["labels"][0]["accepted_profile_count"] == 2


def test_build_dataset_readiness_summary_counts_contract_mismatches(monkeypatch, tmp_path: Path) -> None:
    data_dir = tmp_path / "data"
    manifest_path = data_dir / "datasets" / "training_manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("MLP_DATA_DIR", str(data_dir))
    monkeypatch.setenv("MLP_MANIFEST_PATH", str(manifest_path))
    monkeypatch.setenv("MLP_BUNDLE_LANDMARK_POLICY", "bundle_only")

    module = importlib.reload(importlib.import_module("amyserver_tools.evaluate_dataset_readiness"))

    manifest_path.write_text(
        json.dumps(
            {
                "entries": [
                    _write_bundle(data_dir, "bundle-good-1", "HALLO", "profile-a"),
                    _write_bundle(data_dir, "bundle-good-2", "HALLO", "profile-b"),
                    _write_bundle(
                        data_dir,
                        "bundle-bad-contract",
                        "BITTE",
                        "profile-b",
                        valid_contract=False,
                    ),
                ]
            }
        ),
        encoding="utf-8",
    )

    summary = module.build_dataset_readiness_summary(
        manifest_path=manifest_path,
        data_dir=data_dir,
        shots=[1],
    )

    assert summary["manifest"]["feature_contract_mismatch_count"] == 1
    assert summary["manifest"]["rejected_bundle_count"] == 1
    assert summary["rejected_bundles"][0]["issue_codes"] == ["feature_contract_mismatch"]


def test_build_dataset_readiness_summary_handles_missing_manifest(monkeypatch, tmp_path: Path) -> None:
    data_dir = tmp_path / "data"
    manifest_path = data_dir / "datasets" / "training_manifest.json"
    monkeypatch.setenv("MLP_DATA_DIR", str(data_dir))
    monkeypatch.setenv("MLP_MANIFEST_PATH", str(manifest_path))

    module = importlib.reload(importlib.import_module("amyserver_tools.evaluate_dataset_readiness"))

    summary = module.build_dataset_readiness_summary(
        manifest_path=manifest_path,
        data_dir=data_dir,
        shots=[1, 3, 5, 10],
    )

    assert summary["status"] == "blocked"
    assert summary["manifest"]["exists"] is False
    assert summary["blockers"] == [
        "No training manifest snapshot exists at the requested path."
    ]
