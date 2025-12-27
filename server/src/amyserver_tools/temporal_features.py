"""
Multi-Scale Temporal Feature Extraction for Sign Language Recognition

Research basis:
- "Multi-scale local-temporal similarity fusion for continuous sign language" (Pattern Recognition 2022)
- Combines local (short-term) and global (long-term) temporal patterns

Amy First: Better distinction of timing-dependent gestures like "SCHNELL" (fast) vs "LANGSAM" (slow)
"""


import numpy as np


class MultiScaleTemporalExtractor:
    """
    Extracts temporal features at multiple scales to capture both rapid and gradual gesture movements.
    
    Uses temporal convolution at different scales to capture:
    - Local features (scale 3): Rapid hand movements, quick gestures
    - Medium features (scale 5): Standard gesture tempo
    - Global features (scale 7): Slow, careful signing
    
    Example:
        >>> extractor = MultiScaleTemporalExtractor(scales=[3, 5, 7])
        >>> sequence = np.random.randn(10, 63)  # 10 frames, 63 features
        >>> features = extractor.extract_and_fuse(sequence)
        >>> print(features.shape)  # (time_steps, fused_features)
    """

    def __init__(self, scales: list[int] = None):
        """
        Initialize the multi-scale temporal extractor.
        
        Args:
            scales: List of temporal window sizes for feature extraction.
                   Default is [3, 5, 7] for local, medium, and global patterns.
        """
        self.scales = scales if scales is not None else [3, 5, 7]

    def extract_local_features(self, sequence: np.ndarray, scale: int) -> np.ndarray:
        """
        Extract local (short-term) temporal features using convolution.
        
        Args:
            sequence: Input sequence of shape (time_steps, features)
            scale: Temporal window size for local patterns
            
        Returns:
            Local temporal features of shape (time_steps - scale + 1, features)
        """
        if len(sequence) < scale:
            # For very short sequences, return as-is
            return sequence

        # Apply temporal convolution with a box filter
        kernel = np.ones(scale) / scale
        local_features = []

        for feature_idx in range(sequence.shape[1]):
            feature_signal = sequence[:, feature_idx]
            # Convolve and trim to valid region
            convolved = np.convolve(feature_signal, kernel, mode='valid')
            local_features.append(convolved)

        return np.column_stack(local_features)

    def extract_global_features(self, sequence: np.ndarray, scale: int) -> np.ndarray:
        """
        Extract global (long-term) temporal features.
        
        Args:
            sequence: Input sequence of shape (time_steps, features)
            scale: Temporal window size for global patterns
            
        Returns:
            Global temporal features of shape (time_steps - scale + 1, features)
        """
        # For global features, use same convolution but with larger scale
        return self.extract_local_features(sequence, scale)

    def extract_and_fuse(self, sequence: np.ndarray, temporal_scale: float | None = None) -> np.ndarray:
        """
        Extract features at all scales and fuse them.
        
        Args:
            sequence: Input sequence of shape (time_steps, features)
            temporal_scale: Optional temporal scale from Phase 1 augmentation (0.8, 1.0, 1.2)
            
        Returns:
            Fused multi-scale features
        """
        if len(sequence) == 0:
            return np.array([]).reshape(0, sequence.shape[1] * len(self.scales) if sequence.shape[1] > 0 else 0)

        multi_scale_features = []

        # Always use all scales, padding short sequences if necessary
        for scale in self.scales:
            if len(sequence) >= scale:
                features = self.extract_local_features(sequence, scale)
            else:
                # For sequences shorter than scale, use the sequence as-is (no convolution)
                # This ensures consistent feature dimensionality
                features = sequence
            multi_scale_features.append(features)

        if not multi_scale_features:
            # Should never happen, but fallback just in case
            return sequence

        # Find minimum length across all scales
        min_length = min(f.shape[0] for f in multi_scale_features)

        # Trim all features to same length and concatenate
        trimmed_features = [f[:min_length, :] for f in multi_scale_features]
        fused = np.concatenate(trimmed_features, axis=1)

        # If temporal_scale metadata is provided (from Phase 1), we could use it
        # for future adaptive feature weighting
        if temporal_scale is not None:
            # Currently just a placeholder - could weight features by temporal scale
            pass

        return fused

    def get_feature_dimension(self, input_features: int) -> int:
        """
        Calculate the output feature dimension after fusion.
        
        Args:
            input_features: Number of input features per timestep
            
        Returns:
            Total number of features after multi-scale fusion
        """
        return input_features * len(self.scales)
