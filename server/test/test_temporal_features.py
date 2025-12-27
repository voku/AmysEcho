"""
Tests for Multi-Scale Temporal Feature Extraction (TDD approach)

Research basis:
- "Multi-scale local-temporal similarity fusion for continuous sign language" (Pattern Recognition 2022)
- Multi-scale temporal convolution for capturing both rapid and slow gestures

Amy First: Better distinction of timing-dependent gestures like "SCHNELL" (fast) vs "LANGSAM" (slow)
"""

import numpy as np
import pytest

from amyserver_tools.temporal_features import MultiScaleTemporalExtractor


class TestMultiScaleTemporalExtractor:
    """Test suite for temporal feature extraction"""

    def test_extractor_initialization(self):
        """Test that extractor initializes with correct scales"""
        extractor = MultiScaleTemporalExtractor(scales=[3, 5, 7])

        assert extractor.scales == [3, 5, 7]
        assert len(extractor.scales) == 3

    def test_extract_local_temporal_features(self):
        """Test extraction of local (short-term) temporal patterns"""
        extractor = MultiScaleTemporalExtractor(scales=[3, 5, 7])

        # Simulate gesture sequence: 10 frames × 63 landmarks (21 hand × 3 coords)
        sequence = np.random.randn(10, 63)

        local_features = extractor.extract_local_features(sequence, scale=3)

        # Local features should capture short-term patterns
        assert local_features is not None
        assert local_features.shape[0] > 0  # Should produce features
        assert len(local_features.shape) == 2  # (time_steps, features)

    def test_extract_global_temporal_features(self):
        """Test extraction of global (long-term) temporal patterns"""
        extractor = MultiScaleTemporalExtractor(scales=[3, 5, 7])

        # Simulate gesture sequence
        sequence = np.random.randn(10, 63)

        global_features = extractor.extract_global_features(sequence, scale=7)

        # Global features should capture long-term patterns
        assert global_features is not None
        assert global_features.shape[0] > 0
        assert len(global_features.shape) == 2

    def test_multi_scale_feature_fusion(self):
        """Test fusion of features from multiple temporal scales"""
        extractor = MultiScaleTemporalExtractor(scales=[3, 5, 7])

        sequence = np.random.randn(10, 63)

        fused_features = extractor.extract_and_fuse(sequence)

        # Fused features should combine all scales
        assert fused_features is not None
        assert len(fused_features.shape) == 2
        # Should have more features than single scale
        single_scale = extractor.extract_local_features(sequence, scale=3)
        assert fused_features.shape[1] >= single_scale.shape[1]

    def test_fast_vs_slow_gesture_distinction(self):
        """Test that features distinguish fast vs slow signing (Amy First!)"""
        extractor = MultiScaleTemporalExtractor(scales=[3, 5, 7])

        # Simulate fast gesture (rapid changes)
        fast_sequence = np.array([
            np.sin(np.arange(63) * 0.5 * t) for t in range(10)
        ])

        # Simulate slow gesture (gradual changes)
        slow_sequence = np.array([
            np.sin(np.arange(63) * 0.1 * t) for t in range(10)
        ])

        fast_features = extractor.extract_and_fuse(fast_sequence)
        slow_features = extractor.extract_and_fuse(slow_sequence)

        # Features should be different for fast vs slow
        difference = np.abs(fast_features - slow_features).mean()
        assert difference > 0.01  # Should have distinguishable features

    def test_temporal_scale_augmentation_compatibility(self):
        """Test compatibility with Phase 1 temporal augmentation"""
        extractor = MultiScaleTemporalExtractor(scales=[3, 5, 7])

        # Simulate sequence with temporal scale metadata (from Phase 1)
        sequence = np.random.randn(10, 63)
        temporal_scale = 0.8  # Slow signing from Phase 1 augmentation

        # Features should be extractable regardless of temporal scale
        features = extractor.extract_and_fuse(sequence, temporal_scale=temporal_scale)

        assert features is not None
        assert features.shape[0] > 0

    def test_handles_variable_length_sequences(self):
        """Test that extractor handles different sequence lengths"""
        extractor = MultiScaleTemporalExtractor(scales=[3, 5, 7])

        # Short sequence
        short_seq = np.random.randn(5, 63)
        short_features = extractor.extract_and_fuse(short_seq)

        # Long sequence
        long_seq = np.random.randn(20, 63)
        long_features = extractor.extract_and_fuse(long_seq)

        # Both should produce features
        assert short_features is not None
        assert long_features is not None
        # Feature dimensions should be consistent
        assert short_features.shape[1] == long_features.shape[1]

    def test_integration_with_mlp_training(self):
        """Test integration with existing MLP training pipeline"""
        extractor = MultiScaleTemporalExtractor(scales=[3, 5, 7])

        # Simulate training sample with hand landmarks
        hand_landmarks = np.random.randn(10, 21, 3)  # 10 frames, 21 landmarks, xyz

        # Flatten to match MLP input format
        sequence = hand_landmarks.reshape(10, -1)  # (10, 63)

        features = extractor.extract_and_fuse(sequence)

        # Features should be compatible with MLP input
        assert features is not None
        assert not np.isnan(features).any()
        assert not np.isinf(features).any()

    def test_preserves_gesture_semantics(self):
        """Test that feature extraction preserves gesture meaning"""
        extractor = MultiScaleTemporalExtractor(scales=[3, 5, 7])

        # Two identical sequences should produce identical features
        sequence1 = np.random.randn(10, 63)
        sequence2 = sequence1.copy()

        features1 = extractor.extract_and_fuse(sequence1)
        features2 = extractor.extract_and_fuse(sequence2)

        np.testing.assert_array_almost_equal(features1, features2)

    def test_robust_to_noise(self):
        """Test feature extraction is robust to small landmark noise"""
        extractor = MultiScaleTemporalExtractor(scales=[3, 5, 7])

        sequence = np.random.randn(10, 63)
        noisy_sequence = sequence + np.random.randn(10, 63) * 0.01  # Small noise

        features = extractor.extract_and_fuse(sequence)
        noisy_features = extractor.extract_and_fuse(noisy_sequence)

        # Features should be similar despite noise
        similarity = np.corrcoef(features.flatten(), noisy_features.flatten())[0, 1]
        assert similarity > 0.95  # High correlation despite noise


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
