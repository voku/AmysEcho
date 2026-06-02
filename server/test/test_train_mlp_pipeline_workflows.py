"""Focused pipeline workflow coverage for MLP training."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from train_mlp_test_utils import module, sample, small_arch


def test_augmented_variants_preserve_source_groups_and_group_split(monkeypatch):
    small_arch(monkeypatch, feature_size=2, window_size=2)
    samples = [
        sample("A", [1.0, 0.0, 1.0, 0.0], bundle="a-one", mirror_safe=True),
        sample("A", [0.8, 0.2, 0.8, 0.2], bundle="a-two", mirror_safe=True),
        sample("B", [0.0, 1.0, 0.0, 1.0], bundle="b-one"),
        sample("B", [0.2, 0.8, 0.2, 0.8], bundle="b-two"),
    ]
    provenance: dict[str, object] = {}
    X, y, labels, weights, groups = module.dataset_to_arrays(
        samples,
        augmentations_per_sample=1,
        rng=np.random.default_rng(5),
        provenance_sink=provenance,
    )

    assert X.shape[0] == y.shape[0] == weights.shape[0] == groups.shape[0]
    for training_sample in samples:
        assert np.count_nonzero(groups == training_sample.source_bundle_id) >= 2
    train_idx, val_idx = module.plan_grouped_train_validation_split(
        y,
        groups,
        validation_fraction=0.5,
        rng=np.random.RandomState(0),
    )
    assert set(groups[train_idx]).isdisjoint(set(groups[val_idx]))
    assert labels == ["A", "B"]
    assert provenance["augmented_sample_count"] >= 4


def test_pipeline_validation_persists_updated_model_and_label_diagnostics(tmp_path, monkeypatch):
    small_arch(monkeypatch, feature_size=2)
    samples = [
        sample("A", [1.0, 0.0], bundle="a1"),
        sample("A", [0.9, 0.1], bundle="a2"),
        sample("B", [0.0, 1.0], bundle="b1"),
        sample("B", [0.1, 0.9], bundle="b2"),
    ]
    config = module.TrainingConfig(
        epochs=2,
        learning_rate=0.1,
        dropout_rate=0.0,
        validation_fraction=0.5,
        early_stopping_patience=None,
    )
    X, y, labels, weights, _groups = module.dataset_to_arrays(samples, min_samples_target=100)
    initialized = module.train_mlp(
        X,
        y,
        len(labels),
        config=module.replace(config, epochs=0),
        sample_weights=weights,
        rng=np.random.RandomState(7),
    )

    report = module.run_training_pipeline(samples, config=config, output_dir=tmp_path, rng=np.random.RandomState(7))
    model_path = tmp_path / "global" / "amy_model.npz"
    with np.load(model_path, allow_pickle=False) as data:
        saved = (data["w1"].T, data["b1"], data["w2"].T, data["b2"], data["w3"].T, data["b3"])
        assert data["labels"].tolist() == report["global"]["labels"]
        assert data["counts"].tolist() == report["global"]["class_counts"]

    assert any(not np.allclose(actual, initial) for actual, initial in zip(saved, initialized, strict=True))
    diagnostics = report["global"]["label_diagnostics"]
    assert all(entry["confusion_scope"] == "validation" for entry in diagnostics)
    assert all(entry["validation_group_count"] > 0 for entry in diagnostics)


def test_adaptive_augmentation_provenance_caps_and_aligns_groups(monkeypatch):
    small_arch(monkeypatch, feature_size=2, window_size=2)
    samples = [
        sample("A", [1.0, 0.0, 1.0, 0.0], bundle="a1", mirror_safe=True),
        sample("B", [0.0, 1.0, 0.0, 1.0], bundle="b1", mirror_safe=False),
    ]
    provenance: dict[str, object] = {}
    X, y, _labels, weights, groups = module.dataset_to_arrays(
        samples,
        rng=np.random.default_rng(6),
        provenance_sink=provenance,
        min_samples_target=100,
    )

    assert provenance["augmented_sample_count"] == 100
    assert len(provenance["temporal_augmentations"]) == 100
    assert {item["mirror_safe"] for item in provenance["temporal_augmentations"]} == {True, False}
    assert X.shape[0] == y.shape[0] == weights.shape[0] == groups.shape[0] == 102
    assert np.count_nonzero(groups == "a1") == 51
    assert np.count_nonzero(groups == "b1") == 51


def test_pipeline_episodic_sampling_records_report_and_metadata(tmp_path, monkeypatch):
    small_arch(monkeypatch, feature_size=2)
    samples = [
        sample("A", [1.0, 0.0], bundle="a1"),
        sample("A", [0.9, 0.1], bundle="a2"),
        sample("B", [0.0, 1.0], bundle="b1"),
        sample("B", [0.1, 0.9], bundle="b2"),
    ]
    config = module.TrainingConfig(
        epochs=1,
        learning_rate=0.05,
        validation_fraction=0.0,
        sampling_mode="episodic",
        episodic_n_way=2,
        episodic_k_shot=1,
        episodic_queries_per_class=1,
        episodic_num_episodes=2,
        early_stopping_patience=None,
    )

    report = module.run_training_pipeline(samples, config=config, output_dir=tmp_path, rng=np.random.RandomState(12))
    assert report["global"]["augmentation_provenance"]["episodic_sampling"]["selected_samples"] == 8
    metadata = json.loads((tmp_path / "global" / "training_metadata.json").read_text(encoding="utf-8"))
    assert metadata["augmentation_provenance"]["episodic_sampling"]["enabled"] is True


def test_per_profile_and_global_model_persistence_are_coherent(tmp_path, monkeypatch):
    small_arch(monkeypatch, feature_size=2)
    samples = [
        sample("A", [1.0, 0.0], profile_id="kid-1", bundle="a1"),
        sample("A", [0.9, 0.1], profile_id="kid-1", bundle="a2"),
        sample("B", [0.0, 1.0], profile_id="kid-1", bundle="b1"),
        sample("B", [0.1, 0.9], profile_id="kid-1", bundle="b2"),
    ]
    config = module.TrainingConfig(epochs=1, learning_rate=0.05, validation_fraction=0.0, early_stopping_patience=None)

    report = module.run_training_pipeline(samples, config=config, output_dir=tmp_path, rng=np.random.RandomState(13))

    for relative in [Path("global/amy_model.npz"), Path("kid-1/amy_model.npz")]:
        model_path = tmp_path / relative
        assert model_path.exists()
        with np.load(model_path, allow_pickle=False) as data:
            expected_report = report["global"] if relative.parts[0] == "global" else report["profiles"]["kid-1"]
            assert data["labels"].tolist() == expected_report["labels"]
            assert data["counts"].tolist() == expected_report["class_counts"]
            assert data["prototype_vectors"].shape[0] == data["prototype_support"].shape[0]
            assert set(data["prototype_labels"].tolist()) == set(data["labels"].tolist())
    assert (tmp_path / "kid-1" / "training_metadata.json").exists()
    assert report["profiles"]["kid-1"]["labels"] == report["global"]["labels"]
