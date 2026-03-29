import json
from pathlib import Path

import pytest

from amyserver_tools.train_mlp_fewshot import (
    _aggregate_trials,
    _extract_trial_metrics,
    _load_manifest_entries,
    _partition_profiles,
    _promote_best_model,
    _sample_train_entries,
    _select_best_trial,
    _validate_split_manifest,
)


def test_load_manifest_entries_supports_dict_and_list(tmp_path: Path) -> None:
    dict_manifest = tmp_path / "dict_manifest.json"
    dict_manifest.write_text(json.dumps({"entries": [{"id": "a"}]}), encoding="utf-8")
    assert _load_manifest_entries(dict_manifest) == [{"id": "a"}]

    list_manifest = tmp_path / "list_manifest.json"
    list_manifest.write_text(json.dumps([{"id": "b"}]), encoding="utf-8")
    assert _load_manifest_entries(list_manifest) == [{"id": "b"}]


def test_partition_profiles_produces_disjoint_train_and_test() -> None:
    train, test = _partition_profiles(
        profiles=["p1", "p2", "p3", "p4"],
        seed=42,
        explicit_test_profiles=[],
        test_fraction=0.25,
    )
    assert train
    assert test
    assert set(train).isdisjoint(set(test))


def test_validate_split_manifest_rejects_bundle_overlap() -> None:
    with pytest.raises(ValueError, match="bundle leakage"):
        _validate_split_manifest(
            {
                "seed": 42,
                "shot": 1,
                "train_profiles": ["p1"],
                "test_profiles": ["p2"],
                "train_bundles": ["bundle-1"],
                "test_bundles": ["bundle-1"],
                "train_samples_per_label": {"hallo": 1},
                "test_samples_per_label": {"hallo": 1},
            }
        )


def test_sample_train_entries_skips_labels_without_enough_shots() -> None:
    train_entries = [
        {"id": "b1", "profileId": "p1", "label": "HALLO"},
        {"id": "b2", "profileId": "p1", "label": "HALLO"},
        {"id": "b3", "profileId": "p1", "label": "BITTE"},
    ]
    selected, counts = _sample_train_entries(train_entries, shot=2, seed=1)
    assert counts == {"hallo": 2}
    assert len(selected) == 2


def test_aggregate_trials_computes_mean_and_std() -> None:
    summary = _aggregate_trials(
        [
            {"shot": 1, "metrics": {"accuracy": 0.5, "f1_score": 0.4}},
            {"shot": 1, "metrics": {"accuracy": 0.7, "f1_score": 0.6}},
            {"shot": 3, "metrics": {"accuracy": 0.8, "f1_score": 0.75}},
        ]
    )
    assert summary[1]["mean_accuracy"] == pytest.approx(0.6)
    assert summary[1]["worst_seed_accuracy"] == pytest.approx(0.5)
    assert summary[3]["std_accuracy"] == pytest.approx(0.0)


def test_aggregate_trials_raises_for_missing_metrics() -> None:
    with pytest.raises(ValueError, match="missing accuracy or f1_score"):
        _aggregate_trials([{"shot": 1, "metrics": {"accuracy": 0.5}}])


def test_select_best_trial_prefers_f1_then_accuracy() -> None:
    best = _select_best_trial(
        [
            {"seed": 1, "shot": 1, "metrics": {"accuracy": 0.9, "f1_score": 0.6}},
            {"seed": 2, "shot": 3, "metrics": {"accuracy": 0.8, "f1_score": 0.7}},
            {"seed": 3, "shot": 5, "metrics": {"accuracy": 0.95, "f1_score": 0.7}},
        ]
    )
    assert best["seed"] == 3
    assert best["shot"] == 5


def test_promote_best_model_copies_directory(tmp_path: Path) -> None:
    source = tmp_path / "source_models"
    source.mkdir(parents=True)
    (source / "amy_model.npz").write_text("weights", encoding="utf-8")
    destination = tmp_path / "dest_models"

    result = _promote_best_model({"model_output_dir": str(source)}, destination)

    assert (destination / "amy_model.npz").read_text(encoding="utf-8") == "weights"
    assert result["promoted"] is True


def test_extract_trial_metrics_falls_back_to_zero_without_required_schema() -> None:
    assert _extract_trial_metrics({"status": "ok"}) == (0.0, 0.0, True)


def test_promote_best_model_reports_missing_source(tmp_path: Path) -> None:
    missing = tmp_path / "missing-source"
    result = _promote_best_model({"model_output_dir": str(missing)}, tmp_path / "destination")
    assert result["promoted"] is False
    assert result["reason"] == "missing_model_output_dir"
