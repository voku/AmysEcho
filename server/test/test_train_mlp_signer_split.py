import json
import subprocess
import sys
from pathlib import Path

import pytest

import amyserver_tools.train_mlp_sweep as sweep_module
from amyserver_tools.train_mlp import collect_manifest_signer_scope, validate_manifest_signer_split


def test_collect_manifest_signer_scope_reads_profile_from_metadata() -> None:
    profiles, bundles = collect_manifest_signer_scope(
        {
            "entries": [
                {"id": "bundle-1", "metadata": {"profileId": "kid-a"}},
                {"id": "bundle-2", "profileId": "kid-b"},
                {"id": "bundle-3", "profileId": "  kid-b  "},
            ]
        }
    )

    assert profiles == {"kid-a", "kid-b"}
    assert bundles == {"bundle-1", "bundle-2", "bundle-3"}


def test_validate_manifest_signer_split_rejects_overlapping_profiles() -> None:
    train_manifest = {"entries": [{"id": "bundle-1", "profileId": "kid-a"}]}
    test_manifest = {"entries": [{"id": "bundle-2", "profileId": "kid-a"}]}

    with pytest.raises(ValueError, match="signer leakage"):
        validate_manifest_signer_split(train_manifest, test_manifest)


def test_validate_manifest_signer_split_returns_counts_for_disjoint_split() -> None:
    train_manifest = {
        "entries": [
            {"id": "bundle-1", "profileId": "kid-a"},
            {"id": "bundle-2", "profileId": "kid-b"},
        ]
    }
    test_manifest = {
        "entries": [
            {"id": "bundle-3", "profileId": "kid-c"},
        ]
    }

    report = validate_manifest_signer_split(train_manifest, test_manifest)

    assert report == {
        "train_profile_count": 2,
        "test_profile_count": 1,
        "train_bundle_count": 2,
        "test_bundle_count": 1,
    }


def test_sweep_includes_signer_split_validation_in_output(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    train_manifest = tmp_path / "train_manifest.json"
    heldout_manifest = tmp_path / "heldout_manifest.json"
    train_manifest.write_text(
        json.dumps({"entries": [{"id": "bundle-1", "profileId": "kid-a"}]}), encoding="utf-8"
    )
    heldout_manifest.write_text(
        json.dumps({"entries": [{"id": "bundle-2", "profileId": "kid-b"}]}), encoding="utf-8"
    )

    def _fake_run(*_args: object, **_kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(
            args=["python", "train_mlp.py"],
            returncode=0,
            stdout='{"global":{"accuracy":0.7,"f1_score":0.6}}',
            stderr="",
        )

    monkeypatch.setattr(sweep_module, "_resolve_train_script", lambda: tmp_path / "train_mlp.py")
    monkeypatch.setattr(sweep_module.subprocess, "run", _fake_run)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "train_mlp_sweep.py",
            "--train-manifest",
            str(train_manifest),
            "--heldout-manifest",
            str(heldout_manifest),
            "--data-dir",
            str(tmp_path),
            "--epochs",
            "1",
            "--learning-rates",
            "0.001",
            "--dropouts",
            "0.1",
            "--early-stopping",
            "1",
            "--trials",
            "1",
        ],
    )

    sweep_module.main()
    output = json.loads(capsys.readouterr().out)
    assert output["signer_split_validation"]["train_profile_count"] == 1
    assert output["signer_split_validation"]["test_profile_count"] == 1
