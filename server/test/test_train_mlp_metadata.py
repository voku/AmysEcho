import importlib

import numpy as np
from sliding_window import Sample


def test_save_model_writes_audio_feature_size(monkeypatch, tmp_path):
    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))
    monkeypatch.setattr(module, "WINDOW_FEATURE_SIZE", 4)
    monkeypatch.setattr(module, "INPUT_FEATURE_SIZE", 2)
    monkeypatch.setattr(module, "WINDOW_SIZE", 2)

    input_dim = module.WINDOW_FEATURE_SIZE + 2
    layer1 = 3
    layer2 = 2
    output = 1

    w1 = np.zeros((input_dim, layer1), dtype=np.float32)
    b1 = np.zeros((layer1,), dtype=np.float32)
    w2 = np.zeros((layer1, layer2), dtype=np.float32)
    b2 = np.zeros((layer2,), dtype=np.float32)
    w3 = np.zeros((layer2, output), dtype=np.float32)
    b3 = np.zeros((output,), dtype=np.float32)

    dest = tmp_path / "model.npz"
    module.save_model(dest, (w1, b1, w2, b2, w3, b3), labels=["audio"])

    data = np.load(dest)
    assert int(data["input_dim"].item()) == input_dim
    assert int(data["audio_feature_size"].item()) == 2
    assert int(data["window_size"].item()) == 2
    assert int(data["feature_size"].item()) == 2


def test_save_model_writes_sparse_prototype_bank(monkeypatch, tmp_path):
    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))
    monkeypatch.setattr(module, "WINDOW_FEATURE_SIZE", 4)
    monkeypatch.setattr(module, "INPUT_FEATURE_SIZE", 2)
    monkeypatch.setattr(module, "WINDOW_SIZE", 2)

    w1 = np.zeros((4, 3), dtype=np.float32)
    b1 = np.zeros((3,), dtype=np.float32)
    w2 = np.zeros((3, 2), dtype=np.float32)
    b2 = np.zeros((2,), dtype=np.float32)
    w3 = np.zeros((2, 2), dtype=np.float32)
    b3 = np.zeros((2,), dtype=np.float32)

    prototype_vectors = np.array(
        [
            [1.0, 0.0, 0.0, 0.0],
            [0.0, 1.0, 0.0, 0.0],
        ],
        dtype=np.float32,
    )
    prototype_support = np.array([3.0, 1.0], dtype=np.float32)

    dest = tmp_path / "model_with_prototypes.npz"
    module.save_model(
        dest,
        (w1, b1, w2, b2, w3, b3),
        labels=["hilfe", "trinken"],
        prototype_vectors=prototype_vectors,
        prototype_labels=["hilfe", "trinken"],
        prototype_support=prototype_support,
    )

    data = np.load(dest)
    assert data["prototype_vectors"].shape == (2, 4)
    assert data["prototype_labels"].tolist() == ["hilfe", "trinken"]
    assert data["prototype_support"].astype(float).tolist() == [3.0, 1.0]


def test_build_prototype_bank_keeps_sparse_examples(monkeypatch):
    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))
    monkeypatch.setattr(module, "WINDOW_FEATURE_SIZE", 4)
    monkeypatch.setattr(module, "INPUT_FEATURE_SIZE", 2)
    monkeypatch.setattr(module, "WINDOW_SIZE", 2)

    samples = [
        Sample(label="hilfe", profile_id=None, landmarks=[1.0, 0.0, 0.0, 0.0]),
        Sample(label="hilfe", profile_id=None, landmarks=[0.0, 1.0, 0.0, 0.0]),
        Sample(label="trinken", profile_id=None, landmarks=[0.0, 0.0, 1.0, 0.0]),
    ]

    vectors, labels, support = module.build_prototype_bank(
        samples,
        use_multimodal=False,
        max_vectors_per_label=4,
    )

    assert vectors.shape == (3, 4)
    assert labels == ["hilfe", "hilfe", "trinken"]
    assert support.astype(float).tolist() == [1.0, 1.0, 1.0]
    assert np.allclose(np.linalg.norm(vectors, axis=1), np.ones(3))


def test_plan_grouped_train_validation_split_keeps_bundle_groups_together():
    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))

    y = np.array([0, 0, 0, 0], dtype=np.int64)
    groups = np.array(["bundle-a", "bundle-a", "bundle-b", "bundle-b"], dtype=object)

    train_idx, val_idx = module.plan_grouped_train_validation_split(
        y,
        groups,
        validation_fraction=0.5,
        rng=np.random.RandomState(0),
    )

    train_groups = {groups[index] for index in train_idx.tolist()}
    val_groups = {groups[index] for index in val_idx.tolist()}

    assert train_groups.isdisjoint(val_groups)
    assert len(train_idx) == 2
    assert len(val_idx) == 2


def test_plan_grouped_train_validation_split_reserves_validation_group_for_sparse_labels():
    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))

    y = np.array([0, 0, 0, 0], dtype=np.int64)
    groups = np.array(["bundle-a", "bundle-a", "bundle-b", "bundle-b"], dtype=object)

    train_idx, val_idx = module.plan_grouped_train_validation_split(
        y,
        groups,
        validation_fraction=0.15,
        rng=np.random.RandomState(0),
    )

    train_groups = {groups[index] for index in train_idx.tolist()}
    val_groups = {groups[index] for index in val_idx.tolist()}

    assert len(train_groups) == 1
    assert len(val_groups) == 1
    assert train_groups.isdisjoint(val_groups)
    assert len(val_idx) == 2


def test_run_training_pipeline_reports_sparse_label_diagnostics(monkeypatch):
    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))
    monkeypatch.setattr(module, "WINDOW_FEATURE_SIZE", 4)
    monkeypatch.setattr(module, "INPUT_FEATURE_SIZE", 2)
    monkeypatch.setattr(module, "WINDOW_SIZE", 2)

    samples = [
        Sample(label="satt", profile_id="profile-1", landmarks=[1.0, 0.0, 0.0, 0.0], source_bundle_id="bundle-s1"),
        Sample(label="satt", profile_id="profile-1", landmarks=[0.8, 0.2, 0.0, 0.0], source_bundle_id="bundle-s2"),
        Sample(label="trinken", profile_id="profile-1", landmarks=[0.0, 1.0, 0.0, 0.0], source_bundle_id="bundle-t1"),
        Sample(label="trinken", profile_id="profile-1", landmarks=[0.0, 0.9, 0.1, 0.0], source_bundle_id="bundle-t2"),
    ]

    report = module.run_training_pipeline(
        samples,
        config=module.TrainingConfig(
            epochs=1,
            learning_rate=0.0,
            dropout_rate=0.0,
            validation_fraction=0.5,
            random_seed=0,
        ),
        rng=np.random.RandomState(0),
        metadata_context={
            "stats": {
                "label_bundle_summary": [
                    {
                        "label": "satt",
                        "profile_id": "profile-1",
                        "accepted_bundle_count": 2,
                        "rejected_bundle_count": 1,
                    },
                    {
                        "label": "trinken",
                        "profile_id": "profile-1",
                        "accepted_bundle_count": 2,
                        "rejected_bundle_count": 0,
                    },
                ],
            },
        },
    )

    global_diagnostics = {
        entry["label"]: entry
        for entry in report["global"]["label_diagnostics"]
    }
    profile_diagnostics = {
        entry["label"]: entry
        for entry in report["profiles"]["profile-1"]["label_diagnostics"]
    }

    assert global_diagnostics["satt"]["prototype_count"] >= 1
    assert global_diagnostics["satt"]["window_count"] == 2
    assert global_diagnostics["satt"]["confusion_scope"] == "validation"
    assert profile_diagnostics["satt"]["bundle_count"] == 2
    assert profile_diagnostics["satt"]["rejected_bundle_count"] == 1
    assert profile_diagnostics["trinken"]["validation_group_count"] == 1
    assert profile_diagnostics["trinken"]["confusion_scope"] == "validation"


def test_merge_bundle_summary_handles_sparse_entries():
    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))

    accepted, rejected = module._merge_bundle_summary_counts(
        [
            {
                "label": "satt",
                "profile_id": "profile-1",
                "accepted_bundle_count": 2,
            },
            {
                "label": "satt",
                "profile_id": "profile-1",
                "rejected_bundle_count": 1,
            },
            {
                "label": "trinken",
                "profile_id": "profile-1",
                "accepted_bundle_count": 5,
                "rejected_bundle_count": 4,
            },
        ],
        label="satt",
        profile_id="profile-1",
    )

    assert accepted == 2
    assert rejected == 1
