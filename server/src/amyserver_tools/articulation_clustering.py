"""
Articulation-Based Clustering for Sign Language Recognition

Research Foundation:
- "Articulation-based clustering for unsupervised sign language recognition" (ACM 2022)
- Groups signers by gesture amplitude, speed, and range of motion
- Enables cluster-specific model fine-tuning for personalization

Amy First Impact:
- Recognizes Amy's unique signing style (e.g., small vs large movements)
- Adapts model to her physical capabilities and preferences
- Groups similar signing patterns for better learning
"""

from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple
import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler


@dataclass
class ArticulationFeatures:
    """Features that characterize how a gesture is articulated."""
    
    amplitude: float  # Maximum displacement during gesture
    average_speed: float  # Average movement speed
    range_of_motion: float  # Spatial extent of movement
    gesture_duration: float  # Time duration of gesture
    
    def to_vector(self) -> List[float]:
        """Convert features to vector for clustering."""
        return [
            self.amplitude,
            self.average_speed,
            self.range_of_motion,
            self.gesture_duration
        ]


class ArticulationClustering:
    """
    Clusters sign language gestures based on articulation characteristics.
    
    This enables personalized recognition by grouping signers with similar
    physical articulation patterns (e.g., small vs large movements, fast vs slow).
    """
    
    def __init__(self, n_clusters: int = 3):
        """
        Initialize articulation clustering.
        
        Args:
            n_clusters: Number of articulation clusters to create
        """
        self.n_clusters = n_clusters
        self.kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        self.scaler = StandardScaler()
        self.cluster_centroids_: Optional[np.ndarray] = None
        self.cluster_sizes_: Optional[np.ndarray] = None
        
    def extract_features(self, landmarks: np.ndarray) -> ArticulationFeatures:
        """
        Extract articulation features from gesture landmarks.
        
        Args:
            landmarks: Hand landmarks array of shape (n_frames, n_landmarks, 3)
                      where 3 = (x, y, z) coordinates
        
        Returns:
            ArticulationFeatures capturing amplitude, speed, and range
        """
        # Calculate frame-to-frame displacements
        if len(landmarks) < 2:
            # Not enough frames
            return ArticulationFeatures(
                amplitude=0.0,
                average_speed=0.0,
                range_of_motion=0.0,
                gesture_duration=0.0
            )
        
        # Compute centroid of hand at each frame (average of all landmarks)
        centroids = np.mean(landmarks, axis=1)  # (n_frames, 3)
        
        # Calculate displacements between consecutive frames
        displacements = np.linalg.norm(centroids[1:] - centroids[:-1], axis=1)
        
        # Amplitude: maximum displacement in a single frame
        amplitude = float(np.max(displacements)) if len(displacements) > 0 else 0.0
        
        # Average speed: mean displacement per frame
        average_speed = float(np.mean(displacements)) if len(displacements) > 0 else 0.0
        
        # Range of motion: spatial extent (bounding box diagonal)
        min_coords = np.min(landmarks.reshape(-1, 3), axis=0)
        max_coords = np.max(landmarks.reshape(-1, 3), axis=0)
        range_of_motion = float(np.linalg.norm(max_coords - min_coords))
        
        # Gesture duration (number of frames as proxy)
        gesture_duration = float(len(landmarks))
        
        return ArticulationFeatures(
            amplitude=amplitude,
            average_speed=average_speed,
            range_of_motion=range_of_motion,
            gesture_duration=gesture_duration
        )
    
    def fit_predict(self, gestures: List[np.ndarray]) -> np.ndarray:
        """
        Cluster gestures based on their articulation characteristics.
        
        Args:
            gestures: List of landmark sequences, each of shape (n_frames, n_landmarks, 3)
        
        Returns:
            Cluster labels for each gesture
        """
        # Extract features from all gestures
        features_list = [self.extract_features(g) for g in gestures]
        feature_vectors = np.array([f.to_vector() for f in features_list])
        
        return self.fit_predict_from_features(feature_vectors)
    
    def fit_predict_from_features(self, feature_vectors: List[List[float]]) -> np.ndarray:
        """
        Cluster based on pre-extracted feature vectors.
        
        Args:
            feature_vectors: List of feature vectors
        
        Returns:
            Cluster labels
        """
        feature_array = np.array(feature_vectors)
        
        # Adjust number of clusters if we have fewer samples
        n_samples = len(feature_array)
        effective_n_clusters = min(self.n_clusters, n_samples)
        
        # Normalize features
        if len(feature_array) > 0:
            feature_array = self.scaler.fit_transform(feature_array)
        
        # Perform clustering with adjusted cluster count
        if effective_n_clusters < self.n_clusters:
            # Temporarily use fewer clusters
            temp_kmeans = KMeans(n_clusters=effective_n_clusters, random_state=42, n_init=10)
            cluster_labels = temp_kmeans.fit_predict(feature_array)
            self.cluster_centroids_ = temp_kmeans.cluster_centers_
        else:
            cluster_labels = self.kmeans.fit_predict(feature_array)
            self.cluster_centroids_ = self.kmeans.cluster_centers_
        
        # Store cluster information
        unique_labels, counts = np.unique(cluster_labels, return_counts=True)
        self.cluster_sizes_ = dict(zip(unique_labels.tolist(), counts.tolist()))
        
        return cluster_labels
    
    def get_cluster_info(self, cluster_id: int) -> Optional[Dict]:
        """
        Get information about a specific cluster.
        
        Args:
            cluster_id: ID of the cluster
        
        Returns:
            Dictionary with cluster information, or None if invalid ID
        """
        if self.cluster_centroids_ is None or cluster_id >= len(self.cluster_centroids_):
            return None
        
        return {
            'centroid': self.cluster_centroids_[cluster_id].tolist(),
            'size': self.cluster_sizes_.get(cluster_id, 0)
        }
    
    def predict(self, gestures: List[np.ndarray]) -> np.ndarray:
        """
        Predict cluster labels for new gestures.
        
        Args:
            gestures: List of landmark sequences
        
        Returns:
            Predicted cluster labels
        """
        features_list = [self.extract_features(g) for g in gestures]
        feature_vectors = np.array([f.to_vector() for f in features_list])
        
        # Normalize using fitted scaler
        feature_vectors = self.scaler.transform(feature_vectors)
        
        return self.kmeans.predict(feature_vectors)
