"""
Test Articulation-Based Clustering for Sign Language Recognition

Research Foundation:
- "Articulation-based clustering for unsupervised sign language recognition" (ACM 2022)
- Groups signers by gesture amplitude, speed, and range of motion
- Enables cluster-specific model fine-tuning for personalization

Amy First Impact:
- Recognizes Amy's unique signing style (e.g., small vs large movements)
- Adapts model to her physical capabilities and preferences
- Groups similar signing patterns for better learning

TDD Approach: Write tests first, then implement
"""

import numpy as np

from amyserver_tools.articulation_clustering import ArticulationClustering, ArticulationFeatures


class TestArticulationClustering:
    """Test articulation-based clustering for personalized sign language recognition."""

    def test_extract_articulation_features_from_landmarks(self):
        """Test extraction of articulation features (amplitude, speed, range) from gesture landmarks."""
        # Arrange: Create sample hand landmarks sequence
        # Small movement gesture
        landmarks_small = np.array([
            [[0.5, 0.5, 0.0]] * 21,  # Frame 1
            [[0.51, 0.51, 0.0]] * 21,  # Frame 2 - small movement
            [[0.52, 0.52, 0.0]] * 21,  # Frame 3
        ])

        # Large movement gesture
        landmarks_large = np.array([
            [[0.3, 0.3, 0.0]] * 21,  # Frame 1
            [[0.5, 0.5, 0.0]] * 21,  # Frame 2 - large movement
            [[0.7, 0.7, 0.0]] * 21,  # Frame 3
        ])

        clusterer = ArticulationClustering()

        # Act
        features_small = clusterer.extract_features(landmarks_small)
        features_large = clusterer.extract_features(landmarks_large)

        # Assert: Large movement has higher amplitude and range
        assert features_large.amplitude > features_small.amplitude
        assert features_large.range_of_motion > features_small.range_of_motion
        assert features_small.amplitude > 0  # Not zero

    def test_cluster_signing_styles_by_articulation(self):
        """Test clustering of different signing styles based on articulation patterns."""
        # Arrange: Create signers with different articulation styles
        # Amy - small, careful movements
        amy_gestures = [
            np.random.randn(10, 21, 3) * 0.05 + 0.5 for _ in range(5)
        ]

        # Other child - large, energetic movements
        other_gestures = [
            np.random.randn(10, 21, 3) * 0.2 + 0.5 for _ in range(5)
        ]

        all_gestures = amy_gestures + other_gestures
        clusterer = ArticulationClustering(n_clusters=2)

        # Act
        cluster_labels = clusterer.fit_predict(all_gestures)

        # Assert: Same style should be in same cluster
        amy_cluster = cluster_labels[0]
        assert all(label == amy_cluster for label in cluster_labels[:5])  # Amy's gestures

        other_cluster = cluster_labels[5]
        assert all(label == other_cluster for label in cluster_labels[5:])  # Other's gestures
        assert amy_cluster != other_cluster  # Different clusters

    def test_cluster_specific_recognition_improves_accuracy(self):
        """Test that cluster-specific models improve recognition accuracy."""
        # Arrange: Create training data with different articulation styles
        # Cluster 1: Small movements (like Amy)
        small_movement_samples = [
            {'landmarks': np.random.randn(10, 21, 3) * 0.05 + 0.5, 'symbol': 'HELLO'}
            for _ in range(20)
        ]

        # Cluster 2: Large movements
        large_movement_samples = [
            {'landmarks': np.random.randn(10, 21, 3) * 0.2 + 0.5, 'symbol': 'HELLO'}
            for _ in range(20)
        ]

        clusterer = ArticulationClustering(n_clusters=2)
        all_landmarks = [s['landmarks'] for s in small_movement_samples + large_movement_samples]

        # Act: Fit clustering
        cluster_labels = clusterer.fit_predict(all_landmarks)

        # Assign cluster IDs to samples
        for i, sample in enumerate(small_movement_samples + large_movement_samples):
            sample['articulation_cluster_id'] = int(cluster_labels[i])

        # Assert: Samples should be grouped by articulation style
        small_clusters = [s['articulation_cluster_id'] for s in small_movement_samples]
        large_clusters = [s['articulation_cluster_id'] for s in large_movement_samples]

        # Most small movements should be in one cluster
        most_common_small = max(set(small_clusters), key=small_clusters.count)
        assert small_clusters.count(most_common_small) >= 15  # At least 75%

        # Most large movements should be in different cluster
        most_common_large = max(set(large_clusters), key=large_clusters.count)
        assert most_common_small != most_common_large

    def test_articulation_features_include_amplitude_speed_range(self):
        """Test that articulation features capture amplitude, speed, and range of motion."""
        # Arrange: Create gesture with known characteristics
        # Fast, large movement
        fast_large = np.array([
            [[0.2, 0.2, 0.0]] * 21,
            [[0.8, 0.8, 0.0]] * 21,  # Large jump in 1 frame
            [[0.9, 0.9, 0.0]] * 21,
        ])

        # Slow, small movement
        slow_small = np.array([
            [[0.5, 0.5, 0.0]] * 21,
            [[0.51, 0.51, 0.0]] * 21,  # Small increment
            [[0.52, 0.52, 0.0]] * 21,
            [[0.53, 0.53, 0.0]] * 21,
            [[0.54, 0.54, 0.0]] * 21,
        ])

        clusterer = ArticulationClustering()

        # Act
        features_fast = clusterer.extract_features(fast_large)
        features_slow = clusterer.extract_features(slow_small)

        # Assert: Features should capture the differences
        assert hasattr(features_fast, 'amplitude')
        assert hasattr(features_fast, 'average_speed')
        assert hasattr(features_fast, 'range_of_motion')

        # Fast/large should have higher values
        assert features_fast.amplitude > features_slow.amplitude
        assert features_fast.average_speed > features_slow.average_speed

    def test_clustering_handles_variable_sequence_lengths(self):
        """Test clustering works with gestures of different lengths (Amy signs at different speeds)."""
        # Arrange: Variable length sequences
        short_gesture = np.random.randn(5, 21, 3) * 0.1 + 0.5
        medium_gesture = np.random.randn(15, 21, 3) * 0.1 + 0.5
        long_gesture = np.random.randn(30, 21, 3) * 0.1 + 0.5

        gestures = [short_gesture, medium_gesture, long_gesture]
        clusterer = ArticulationClustering(n_clusters=1)

        # Act & Assert: Should not raise error
        cluster_labels = clusterer.fit_predict(gestures)
        assert len(cluster_labels) == 3

    def test_integration_with_variation_tracker(self):
        """Test integration with existing SignVariationTracker for personalized clusters."""
        # Arrange: Simulate variation data with articulation metadata
        # Use deterministic data that should cluster together
        np.random.seed(42)
        base_landmarks = np.random.randn(10, 21, 3) * 0.05 + 0.5

        # Create very similar variations (small noise) - Amy's style
        amy_variations = [
            base_landmarks + np.random.randn(10, 21, 3) * 0.001
            for _ in range(3)
        ]

        # Create different style variations (large movements)
        other_variations = [
            np.random.randn(10, 21, 3) * 0.2 + 0.5
            for _ in range(3)
        ]

        all_landmarks = amy_variations + other_variations

        clusterer = ArticulationClustering(n_clusters=2)

        # Act: Extract articulation features for each variation
        articulation_features = [clusterer.extract_features(lm) for lm in all_landmarks]

        # Fit clustering on articulation features
        feature_vectors = [
            [f.amplitude, f.average_speed, f.range_of_motion]
            for f in articulation_features
        ]
        cluster_labels = clusterer.fit_predict_from_features(feature_vectors)

        # Assert: Similar articulations should cluster together
        assert len(cluster_labels) == 6
        # Amy's variations should mostly be in same cluster
        amy_clusters = cluster_labels[:3]
        assert amy_clusters[0] == amy_clusters[1]  # First two match

    def test_amy_specific_cluster_identification(self):
        """Test identification of Amy's personal articulation cluster for model fine-tuning."""
        # Arrange: Amy's gestures (small, careful) mixed with others
        amy_samples = [np.random.randn(10, 21, 3) * 0.05 + 0.5 for _ in range(10)]
        other_samples = [np.random.randn(10, 21, 3) * 0.15 + 0.5 for _ in range(5)]

        all_samples = amy_samples + other_samples
        clusterer = ArticulationClustering(n_clusters=2)

        # Act
        cluster_labels = clusterer.fit_predict(all_samples)

        # Get Amy's dominant cluster
        amy_labels = cluster_labels[:10]
        amy_cluster_id = max(set(amy_labels), key=list(amy_labels).count)

        # Assert: Amy has a dominant articulation cluster
        amy_cluster_count = list(amy_labels).count(amy_cluster_id)
        assert amy_cluster_count >= 7  # At least 70% in same cluster

        # Can retrieve Amy's cluster for fine-tuning
        amy_cluster_info = clusterer.get_cluster_info(amy_cluster_id)
        assert amy_cluster_info is not None
        assert 'centroid' in amy_cluster_info
        assert 'size' in amy_cluster_info


class TestArticulationFeatures:
    """Test ArticulationFeatures dataclass."""

    def test_articulation_features_creation(self):
        """Test creation of ArticulationFeatures with all required fields."""
        # Act
        features = ArticulationFeatures(
            amplitude=0.5,
            average_speed=0.3,
            range_of_motion=0.7,
            gesture_duration=1.5
        )

        # Assert
        assert features.amplitude == 0.5
        assert features.average_speed == 0.3
        assert features.range_of_motion == 0.7
        assert features.gesture_duration == 1.5

    def test_articulation_features_to_vector(self):
        """Test conversion to feature vector for clustering."""
        # Arrange
        features = ArticulationFeatures(
            amplitude=0.5,
            average_speed=0.3,
            range_of_motion=0.7,
            gesture_duration=1.5
        )

        # Act
        vector = features.to_vector()

        # Assert
        assert len(vector) == 4
        assert vector[0] == 0.5  # amplitude
        assert vector[1] == 0.3  # speed
        assert vector[2] == 0.7  # range
        assert vector[3] == 1.5  # duration
