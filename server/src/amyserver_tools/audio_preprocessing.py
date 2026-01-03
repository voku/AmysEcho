#!/usr/bin/env python3
"""
Audio preprocessing utilities for multimodal gesture recognition.

Amy First: Enables processing verbal utterances alongside sign language gestures,
supporting Amy's learning progression whether she's using gestures, speech, or both.
"""

import logging
from pathlib import Path
from typing import Any

import numpy as np

LOGGER = logging.getLogger("amyserver.audio_preprocessing")

# Audio feature configuration
DEFAULT_SAMPLE_RATE = 16000  # Standard for speech recognition
DEFAULT_N_MFCC = 13  # Mel-frequency cepstral coefficients
DEFAULT_N_MELS = 40  # Mel filterbank features
DEFAULT_HOP_LENGTH = 512  # Frame shift in samples
DEFAULT_WIN_LENGTH = 2048  # Window length for FFT

# Audio quality thresholds
MIN_AUDIO_DURATION_MS = 100  # Minimum meaningful audio duration
MAX_AUDIO_DURATION_MS = 5000  # Maximum audio duration to process
MIN_AUDIO_ENERGY_THRESHOLD = 0.01  # Minimum energy to consider non-silent


try:
    import librosa
    import soundfile as sf
    AUDIO_LIBS_AVAILABLE = True
except ImportError:
    librosa = None
    sf = None
    AUDIO_LIBS_AVAILABLE = False
    LOGGER.warning(
        "Audio processing libraries (librosa, soundfile) not available. "
        "Install with: pip install librosa soundfile"
    )


class AudioPreprocessingError(Exception):
    """Raised when audio preprocessing fails."""
    pass


def check_audio_dependencies() -> bool:
    """Check if required audio processing libraries are available."""
    return AUDIO_LIBS_AVAILABLE


def load_audio_file(
    file_path: Path,
    target_sr: int = DEFAULT_SAMPLE_RATE,
) -> tuple[np.ndarray, int]:
    """
    Load an audio file and resample to target sample rate.
    
    Args:
        file_path: Path to audio file
        target_sr: Target sample rate (Hz)
        
    Returns:
        Tuple of (audio_data, sample_rate)
        
    Raises:
        AudioPreprocessingError: If loading fails
    """
    if not AUDIO_LIBS_AVAILABLE:
        raise AudioPreprocessingError("Audio libraries not available")
        
    if not file_path.exists():
        raise AudioPreprocessingError(f"Audio file not found: {file_path}")
        
    try:
        # Load and resample audio
        audio_data, sr = librosa.load(
            str(file_path),
            sr=target_sr,
            mono=True,  # Convert to mono
        )
        
        LOGGER.debug(
            f"Loaded audio: {len(audio_data)} samples at {sr}Hz "
            f"({len(audio_data)/sr:.2f}s)"
        )
        
        return audio_data, sr
        
    except Exception as e:
        raise AudioPreprocessingError(f"Failed to load audio: {e}") from e


def extract_mfcc_features(
    audio_data: np.ndarray,
    sample_rate: int,
    n_mfcc: int = DEFAULT_N_MFCC,
    hop_length: int = DEFAULT_HOP_LENGTH,
    win_length: int = DEFAULT_WIN_LENGTH,
) -> np.ndarray:
    """
    Extract MFCC (Mel-frequency cepstral coefficients) features from audio.
    
    MFCCs are widely used for speech recognition as they capture the 
    timbral aspects of speech that are perceptually relevant.
    
    Args:
        audio_data: Audio waveform
        sample_rate: Sample rate in Hz
        n_mfcc: Number of MFCCs to extract
        hop_length: Frame shift in samples
        win_length: Window length for FFT
        
    Returns:
        MFCC features array of shape (n_mfcc, n_frames)
    """
    if not AUDIO_LIBS_AVAILABLE:
        raise AudioPreprocessingError("Audio libraries not available")
        
    try:
        mfccs = librosa.feature.mfcc(
            y=audio_data,
            sr=sample_rate,
            n_mfcc=n_mfcc,
            hop_length=hop_length,
            win_length=win_length,
        )
        
        # Normalize MFCCs (zero mean, unit variance per coefficient)
        mfccs = (mfccs - np.mean(mfccs, axis=1, keepdims=True)) / (
            np.std(mfccs, axis=1, keepdims=True) + 1e-8
        )
        
        LOGGER.debug(f"Extracted MFCC features: shape {mfccs.shape}")
        
        return mfccs
        
    except Exception as e:
        raise AudioPreprocessingError(f"Failed to extract MFCCs: {e}") from e


def extract_mel_spectrogram(
    audio_data: np.ndarray,
    sample_rate: int,
    n_mels: int = DEFAULT_N_MELS,
    hop_length: int = DEFAULT_HOP_LENGTH,
    win_length: int = DEFAULT_WIN_LENGTH,
) -> np.ndarray:
    """
    Extract mel-scale spectrogram features from audio.
    
    Mel spectrograms capture frequency content in a perceptually-motivated scale.
    
    Args:
        audio_data: Audio waveform
        sample_rate: Sample rate in Hz
        n_mels: Number of mel bands
        hop_length: Frame shift in samples
        win_length: Window length for FFT
        
    Returns:
        Mel spectrogram array of shape (n_mels, n_frames)
    """
    if not AUDIO_LIBS_AVAILABLE:
        raise AudioPreprocessingError("Audio libraries not available")
        
    try:
        mel_spec = librosa.feature.melspectrogram(
            y=audio_data,
            sr=sample_rate,
            n_mels=n_mels,
            hop_length=hop_length,
            win_length=win_length,
        )
        
        # Convert to log scale (dB)
        mel_spec_db = librosa.power_to_db(mel_spec, ref=np.max)
        
        # Normalize to [0, 1]
        mel_spec_db = (mel_spec_db - mel_spec_db.min()) / (
            mel_spec_db.max() - mel_spec_db.min() + 1e-8
        )
        
        LOGGER.debug(f"Extracted mel spectrogram: shape {mel_spec_db.shape}")
        
        return mel_spec_db
        
    except Exception as e:
        raise AudioPreprocessingError(f"Failed to extract mel spectrogram: {e}") from e


def detect_speech_activity(
    audio_data: np.ndarray,
    sample_rate: int,
    energy_threshold: float = MIN_AUDIO_ENERGY_THRESHOLD,
) -> tuple[bool, float]:
    """
    Detect if audio contains speech activity.
    
    Args:
        audio_data: Audio waveform
        sample_rate: Sample rate in Hz
        energy_threshold: Minimum energy threshold
        
    Returns:
        Tuple of (has_speech, energy_level)
    """
    # Calculate RMS energy
    energy = np.sqrt(np.mean(audio_data ** 2))
    
    has_speech = energy > energy_threshold
    
    LOGGER.debug(
        f"Speech activity: {'detected' if has_speech else 'not detected'} "
        f"(energy={energy:.4f})"
    )
    
    return has_speech, float(energy)


def preprocess_audio_for_training(
    audio_file_path: Path,
    target_duration_frames: int | None = None,
    target_sr: int = DEFAULT_SAMPLE_RATE,
    feature_type: str = "mfcc",
) -> dict[str, Any]:
    """
    Complete preprocessing pipeline for audio training data.
    
    Amy First: Flexible preprocessing supporting different learning stages -
    whether Amy is using speech, gestures, or both.
    
    Args:
        audio_file_path: Path to audio file
        target_duration_frames: Target number of feature frames (for alignment)
        target_sr: Target sample rate
        feature_type: Type of features to extract ('mfcc', 'mel', or 'both')
        
    Returns:
        Dictionary containing:
            - features: Audio feature array
            - duration_ms: Audio duration in milliseconds
            - has_speech: Whether speech activity detected
            - energy: Audio energy level
            - feature_type: Type of features extracted
            - sample_rate: Sample rate used
    """
    if not check_audio_dependencies():
        return {
            "features": None,
            "duration_ms": 0,
            "has_speech": False,
            "energy": 0.0,
            "error": "Audio libraries not available",
        }
        
    try:
        # Load audio
        audio_data, sr = load_audio_file(audio_file_path, target_sr)
        
        duration_ms = len(audio_data) / sr * 1000
        
        # Check duration
        if duration_ms < MIN_AUDIO_DURATION_MS:
            LOGGER.warning(
                f"Audio too short ({duration_ms:.0f}ms < {MIN_AUDIO_DURATION_MS}ms)"
            )
            return {
                "features": None,
                "duration_ms": duration_ms,
                "has_speech": False,
                "energy": 0.0,
                "error": "Audio too short",
            }
            
        # Detect speech activity
        has_speech, energy = detect_speech_activity(audio_data, sr)
        
        if not has_speech:
            LOGGER.warning("No speech activity detected in audio")
            return {
                "features": None,
                "duration_ms": duration_ms,
                "has_speech": False,
                "energy": energy,
                "error": "No speech detected",
            }
            
        # Extract features
        features = {}
        if feature_type in ("mfcc", "both"):
            mfccs = extract_mfcc_features(audio_data, sr)
            features["mfcc"] = mfccs
            
        if feature_type in ("mel", "both"):
            mel_spec = extract_mel_spectrogram(audio_data, sr)
            features["mel"] = mel_spec
            
        # If target_duration_frames specified, align features temporally
        if target_duration_frames is not None:
            for key in features:
                features[key] = align_audio_features(
                    features[key],
                    target_duration_frames,
                )
                
        return {
            "features": features,
            "duration_ms": duration_ms,
            "has_speech": has_speech,
            "energy": energy,
            "feature_type": feature_type,
            "sample_rate": sr,
            "error": None,
        }
        
    except AudioPreprocessingError as e:
        LOGGER.error(f"Audio preprocessing failed: {e}")
        return {
            "features": None,
            "duration_ms": 0,
            "has_speech": False,
            "energy": 0.0,
            "error": str(e),
        }


def align_audio_features(
    features: np.ndarray,
    target_frames: int,
) -> np.ndarray:
    """
    Align audio features to target number of frames.
    
    This enables temporal alignment between audio and visual gesture features.
    
    Args:
        features: Audio features of shape (n_features, n_frames)
        target_frames: Target number of frames
        
    Returns:
        Aligned features of shape (n_features, target_frames)
    """
    if not AUDIO_LIBS_AVAILABLE:
        raise AudioPreprocessingError("Audio libraries not available")
        
    _n_features, n_frames = features.shape
    
    if n_frames == target_frames:
        return features
        
    # Use librosa's time stretching for temporal alignment
    try:
        rate = n_frames / target_frames
        aligned = librosa.effects.time_stretch(features, rate=rate)
        
        # Ensure exact target length (time_stretch may be slightly off)
        if aligned.shape[1] != target_frames:
            # Resample to exact length
            from scipy import signal
            aligned = signal.resample(aligned, target_frames, axis=1)
            
        LOGGER.debug(
            f"Aligned audio features: {n_frames} -> {target_frames} frames"
        )
        
        return aligned
        
    except Exception as e:
        LOGGER.warning(f"Feature alignment failed, using padding/truncation: {e}")
        
        # Fallback: simple padding or truncation
        if n_frames < target_frames:
            # Pad with zeros
            pad_width = ((0, 0), (0, target_frames - n_frames))
            return np.pad(features, pad_width, mode='constant')
        else:
            # Truncate
            return features[:, :target_frames]


def compute_audio_feature_statistics(
    audio_features: dict[str, np.ndarray]
) -> dict[str, Any]:
    """
    Compute statistics over audio features for quality assessment.
    
    Args:
        audio_features: Dictionary of audio features
        
    Returns:
        Dictionary of statistics
    """
    stats = {}
    
    for feature_type, features in audio_features.items():
        stats[feature_type] = {
            "shape": features.shape,
            "mean": float(np.mean(features)),
            "std": float(np.std(features)),
            "min": float(np.min(features)),
            "max": float(np.max(features)),
        }
        
    return stats


if __name__ == "__main__":
    # Test audio preprocessing
    import sys
    
    logging.basicConfig(level=logging.DEBUG)
    
    if len(sys.argv) < 2:
        print("Usage: python audio_preprocessing.py <audio_file>")
        sys.exit(1)
        
    audio_path = Path(sys.argv[1])
    
    print(f"Processing audio: {audio_path}")
    print(f"Audio libraries available: {check_audio_dependencies()}")
    
    if check_audio_dependencies():
        result = preprocess_audio_for_training(audio_path)
        
        print("\nResults:")
        print(f"  Duration: {result['duration_ms']:.0f}ms")
        print(f"  Has speech: {result['has_speech']}")
        print(f"  Energy: {result['energy']:.4f}")
        
        if result['features']:
            print("\nFeatures:")
            stats = compute_audio_feature_statistics(result['features'])
            for feat_type, feat_stats in stats.items():
                print(f"  {feat_type}: {feat_stats['shape']}")
