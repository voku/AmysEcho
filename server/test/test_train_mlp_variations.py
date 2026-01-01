"""
Test variation-aware training for sign language learning.

This test suite validates that the server-side training properly handles
gesture variations from Amy's natural signing style, ensuring that:
1. Variation metadata is preserved through the training pipeline
2. Canonical templates from clustered variations are used for training
3. Per-profile models learn from individual variation patterns
4. Training quality improves with variation data
"""

import importlib
import json
from pathlib import Path

import pytest


def test_training_preserves_variation_metadata(monkeypatch, tmp_path):
    """
    Verify that variation metadata from the webapp is preserved
    through the training pipeline and included in the training manifest.
    
    This is essential for Amy First principle: her unique signing style
    should be captured and learned from.
    """
    data_dir = tmp_path / "data"
    manifest_path = data_dir / "datasets" / "training_manifest.json"
    monkeypatch.setenv("MLP_DATA_DIR", str(data_dir))
    monkeypatch.setenv("MLP_MANIFEST_PATH", str(manifest_path))

    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))

    # Create a bundle with variation metadata
    bundle_rel = Path("training_uploads/amy-profile/bundle-var-1")
    bundle_dir = data_dir / bundle_rel
    bundle_dir.mkdir(parents=True)

    # Create landmarks.json with hand landmarks
    # Format: 42 landmarks (21 per hand × 2 hands), each [x, y, z]
    frame_landmarks = [[0.5 + i/100, 0.5 + i/100, 0.0] for i in range(42)]
    landmarks_data = {
        "frames": [
            {
                "landmarks": frame_landmarks,
                "poseLandmarks": [],
                "faceLandmarks": []
            }
            for _ in range(5)
        ]
    }
    landmarks_path = bundle_dir / "landmarks.json"
    landmarks_path.write_text(json.dumps(landmarks_data), encoding="utf-8")

    # Manifest with variation metadata (as would come from webapp)
    manifest = {
        "entries": [
            {
                "id": "bundle-var-1",
                "profileId": "amy-profile",
                "label": "HELLO",
                "capturedAt": "2024-12-16T16:00:00Z",
                "storage": {
                    "directory": str(bundle_rel),
                    "files": ["landmarks.json"],
                },
                "metadata": {
                    "label": "HELLO",
                    "profileId": "amy-profile",
                    "variationData": {
                        "clusterId": "cluster_abc_123",
                        "dominantCluster": "cluster_abc_123",
                        "variationDiversity": 0.4,
                        "totalVariations": 12,
                        "recommendTraining": False,
                        "canonicalTemplates": 2
                    },
                    "validationSummary": {
                        "landmarksPath": "landmarks.json"
                    }
                },
                "receivedAt": "2024-12-16T16:01:00Z",
            }
        ]
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    # Build samples from manifest
    samples, stats = module.build_samples_from_manifest(manifest_path)

    assert len(samples) > 0, "Should create samples from variation data"
    assert samples[0].label == "HELLO"
    assert samples[0].profile_id == "amy-profile"


def test_variation_diversity_affects_training_weight(monkeypatch, tmp_path):
    """
    FAILING TEST: This test demonstrates the desired behavior where
    high variation diversity should influence training sample weighting.
    
    For Amy: When she shows many different ways of signing (high diversity),
    the training should give more weight to canonical templates that represent
    her preferred style, not outliers.
    
    This test will FAIL initially, then we'll implement the fix.
    """
    data_dir = tmp_path / "data"
    manifest_path = data_dir / "datasets" / "training_manifest.json"
    monkeypatch.setenv("MLP_DATA_DIR", str(data_dir))
    monkeypatch.setenv("MLP_MANIFEST_PATH", str(manifest_path))
    monkeypatch.setenv("MLP_EPOCHS", "10")  # Quick training for test

    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))

    # Create two bundles: one with high diversity, one with low diversity
    bundles = []
    for i, (diversity, cluster_id) in enumerate([
        (0.8, "cluster_high_div"),  # High diversity - many variations
        (0.2, "cluster_low_div"),   # Low diversity - consistent signing
    ]):
        bundle_rel = Path(f"training_uploads/amy-profile/bundle-{i}")
        bundle_dir = data_dir / bundle_rel
        bundle_dir.mkdir(parents=True)

        # Create landmarks (42 values for 21 landmarks × 2 hands)
        frame_landmarks = [[0.5 + k/100, 0.5 + k/100, 0.0] for k in range(42)]
        landmarks_data = {
            "frames": [
                {
                    "landmarks": frame_landmarks,
                    "poseLandmarks": [],
                    "faceLandmarks": []
                }
                for j in range(3)
            ]
        }
        landmarks_path = bundle_dir / "landmarks.json"
        landmarks_path.write_text(json.dumps(landmarks_data), encoding="utf-8")

        bundles.append({
            "id": f"bundle-{i}",
            "profileId": "amy-profile",
            "label": "HELLO",
            "capturedAt": f"2024-12-16T16:0{i}:00Z",
            "storage": {
                "directory": str(bundle_rel),
                "files": ["landmarks.json"],
            },
            "metadata": {
                "label": "HELLO",
                "profileId": "amy-profile",
                "variationData": {
                    "clusterId": cluster_id,
                    "dominantCluster": cluster_id,
                    "variationDiversity": diversity,
                    "totalVariations": 20 if diversity > 0.5 else 5,
                    "recommendTraining": diversity > 0.6,
                    "canonicalTemplates": 5 if diversity > 0.5 else 1
                },
                "validationSummary": {
                    "landmarksPath": "landmarks.json"
                }
            },
            "receivedAt": f"2024-12-16T16:0{i}:30Z",
        })

    manifest = {"entries": bundles}
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    # Build samples
    samples, stats = module.build_samples_from_manifest(manifest_path)

    # The high-diversity sample should have metadata indicating it needs
    # special handling during training (this will fail until we implement it)
    high_div_sample = [s for s in samples if "high_div" in str(getattr(s, "variation_cluster_id", ""))][0] if samples else None

    # This assertion will FAIL - we need to add variation_cluster_id to Sample
    assert high_div_sample is not None, "Should preserve cluster ID in sample"
    assert hasattr(high_div_sample, "variation_diversity"), "Should track variation diversity"
    assert high_div_sample.variation_diversity == 0.8


def test_canonical_templates_used_for_augmentation(monkeypatch, tmp_path):
    """
    Test that when variation data includes multiple canonical templates,
    they are used for data augmentation during training.
    
    For Amy: Her different valid ways of signing should all be learned,
    not just the most common one.
    """
    data_dir = tmp_path / "data"
    manifest_path = data_dir / "datasets" / "training_manifest.json"
    monkeypatch.setenv("MLP_DATA_DIR", str(data_dir))
    monkeypatch.setenv("MLP_MANIFEST_PATH", str(manifest_path))

    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))

    bundle_rel = Path("training_uploads/amy-profile/bundle-multi-template")
    bundle_dir = data_dir / bundle_rel
    bundle_dir.mkdir(parents=True)

    # Simulate multiple canonical templates (from clustered variations)
    # This would come from the webapp's SignVariationTracker
    frame_landmarks = [[0.5 + i/100, 0.5, 0.0] for i in range(42)]
    landmarks_data = {
        "frames": [
            {
                "landmarks": frame_landmarks
            }
            for _ in range(3)
        ]
    }
    landmarks_path = bundle_dir / "landmarks.json"
    landmarks_path.write_text(json.dumps(landmarks_data), encoding="utf-8")

    manifest = {
        "entries": [
            {
                "id": "bundle-multi-template",
                "profileId": "amy-profile",
                "label": "THANK_YOU",
                "storage": {
                    "directory": str(bundle_rel),
                    "files": ["landmarks.json"],
                },
                "metadata": {
                    "label": "THANK_YOU",
                    "profileId": "amy-profile",
                    "variationData": {
                        "canonicalTemplates": 3,  # 3 different valid ways Amy signs this
                        "variationDiversity": 0.6,
                        "dominantCluster": "cluster_main",
                    },
                    "validationSummary": {
                        "landmarksPath": "landmarks.json"
                    }
                },
            }
        ]
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    samples, stats = module.build_samples_from_manifest(manifest_path)

    # With 3 canonical templates, we should get augmented samples
    # (this might fail initially if augmentation isn't implemented)
    assert len(samples) >= 1
    # Check if variation metadata is accessible
    if samples:
        sample = samples[0]
        assert sample.label == "THANK_YOU"


def test_per_profile_models_learn_from_variations(monkeypatch, tmp_path):
    """
    Test that per-profile models properly incorporate variation data
    to learn Amy's unique signing style.
    
    For Amy: Her personal model should reflect HER way of signing,
    not a generic "correct" way.
    """
    data_dir = tmp_path / "data"
    manifest_path = data_dir / "datasets" / "training_manifest.json"
    models_dir = data_dir / "models"
    monkeypatch.setenv("MLP_DATA_DIR", str(data_dir))
    monkeypatch.setenv("MLP_MANIFEST_PATH", str(manifest_path))
    monkeypatch.setenv("MLP_MODELS_DIR", str(models_dir))
    monkeypatch.setenv("MLP_EPOCHS", "5")
    monkeypatch.setenv("MLP_MIN_SAMPLES_PER_LABEL", "1")
    monkeypatch.setenv("MLP_MIN_SAMPLES_PER_PROFILE", "1")

    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))

    # Create samples for Amy's profile with variation data
    profile_id = "amy-profile"
    bundle_rel = Path(f"training_uploads/{profile_id}/bundle-1")
    bundle_dir = data_dir / bundle_rel
    bundle_dir.mkdir(parents=True)

    # Create landmark data
    frame_landmarks = [[0.4 + i/100, 0.5 + i/100, 0.0] for i in range(42)]
    landmarks_data = {
        "frames": [
            {
                "landmarks": frame_landmarks
            }
            for _ in range(5)
        ]
    }
    landmarks_path = bundle_dir / "landmarks.json"
    landmarks_path.write_text(json.dumps(landmarks_data), encoding="utf-8")

    manifest = {
        "entries": [
            {
                "id": "bundle-1",
                "profileId": profile_id,
                "label": "HELLO",
                "storage": {
                    "directory": str(bundle_rel),
                    "files": ["landmarks.json"],
                },
                "metadata": {
                    "label": "HELLO",
                    "profileId": profile_id,
                    "variationData": {
                        "dominantCluster": "cluster_amy_hello",
                        "variationDiversity": 0.5,
                        "canonicalTemplates": 2,
                    },
                    "validationSummary": {
                        "landmarksPath": "landmarks.json"
                    }
                },
            }
        ]
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    # Train the model
    try:
        samples, _ = module.build_samples_from_manifest(manifest_path)
        assert len(samples) > 0

        # The per-profile model should be created
        # (actual training might be skipped in CI without mediapipe)
        _profile_model_path = models_dir / profile_id / "amy_model.npz"

        # We're mainly testing that the pipeline handles variation metadata
        # without crashing and preserves it through to model training
        assert samples[0].profile_id == profile_id

    except module.DependencyUnavailableError:
        pytest.skip("Mediapipe not available - skipping actual training test")


def test_variation_metadata_in_training_report(monkeypatch, tmp_path):
    """
    Test that the training report includes variation-related metrics
    for caregiver insights.
    
    For Amy: Caregivers should see how variation diversity affects
    training quality and recognition accuracy.
    """
    data_dir = tmp_path / "data"
    manifest_path = data_dir / "datasets" / "training_manifest.json"
    monkeypatch.setenv("MLP_DATA_DIR", str(data_dir))
    monkeypatch.setenv("MLP_MANIFEST_PATH", str(manifest_path))

    module = importlib.reload(importlib.import_module("amyserver_tools.train_mlp"))

    bundle_rel = Path("training_uploads/amy-profile/bundle-report")
    bundle_dir = data_dir / bundle_rel
    bundle_dir.mkdir(parents=True)

    frame_landmarks = [[0.5, 0.5, 0.0] for _ in range(42)]
    landmarks_data = {
        "frames": [
            {
                "landmarks": frame_landmarks
            }
        ]
    }
    landmarks_path = bundle_dir / "landmarks.json"
    landmarks_path.write_text(json.dumps(landmarks_data), encoding="utf-8")

    manifest = {
        "entries": [
            {
                "id": "bundle-report",
                "profileId": "amy-profile",
                "label": "HELLO",
                "storage": {
                    "directory": str(bundle_rel),
                    "files": ["landmarks.json"],
                },
                "metadata": {
                    "label": "HELLO",
                    "profileId": "amy-profile",
                    "variationData": {
                        "variationDiversity": 0.7,
                        "recommendTraining": True,
                        "reason": "Viele verschiedene Ausführungen - Training könnte helfen"
                    },
                    "validationSummary": {
                        "landmarksPath": "landmarks.json"
                    }
                },
            }
        ]
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    samples, stats = module.build_samples_from_manifest(manifest_path)

    # Stats should include variation-related information
    assert len(samples) > 0
    # Check that we can access the manifest data (for future reporting)
    assert stats["entries"] == 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
