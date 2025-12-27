#!/usr/bin/env python3
"""
3-Layer MLP Architecture for AmysEcho
"""

import math
from dataclasses import dataclass

import numpy as np
from config_constants import (
    DROPOUT_RATE,
    EARLY_STOPPING_MIN_DELTA,
    EARLY_STOPPING_PATIENCE,
    EPOCHS,
    LEARNING_RATE,
    LOSS_EPSILON,
    MLP_LAYER1_SIZE,
    MLP_LAYER2_SIZE,
    WINDOW_FEATURE_SIZE,
)

# Type aliases
WeightTuple = tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]


@dataclass(frozen=True)
class TrainingConfig:
    """Configuration for training."""
    learning_rate: float = LEARNING_RATE
    epochs: int = EPOCHS
    dropout_rate: float = DROPOUT_RATE
    early_stopping_patience: int | None = EARLY_STOPPING_PATIENCE
    early_stopping_min_delta: float = EARLY_STOPPING_MIN_DELTA


# ============================================================================
# ACTIVATION FUNCTIONS
# ============================================================================

def relu(x: np.ndarray) -> np.ndarray:
    """ReLU activation: max(0, x)"""
    return np.maximum(0, x)


def relu_derivative(x: np.ndarray) -> np.ndarray:
    """ReLU derivative: 1 if x > 0, else 0"""
    return (x > 0).astype(x.dtype)


def softmax(x: np.ndarray) -> np.ndarray:
    """Numerically stable softmax."""
    exp_x = np.exp(x - np.max(x, axis=1, keepdims=True))
    return exp_x / np.sum(exp_x, axis=1, keepdims=True)


# ============================================================================
# FORWARD PASS
# ============================================================================

def _forward_mlp(
    X: np.ndarray,
    w1: np.ndarray, b1: np.ndarray,
    w2: np.ndarray, b2: np.ndarray,
    w3: np.ndarray, b3: np.ndarray,
    dropout_mask1: np.ndarray | None = None,
    dropout_mask2: np.ndarray | None = None
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Three-layer MLP forward pass.
    """

    # Layer 1
    z1 = np.dot(X, w1) + b1
    a1 = relu(z1)
    if dropout_mask1 is not None:
        a1 *= dropout_mask1

    # Layer 2
    z2 = np.dot(a1, w2) + b2
    a2 = relu(z2)
    if dropout_mask2 is not None:
        a2 *= dropout_mask2

    # Layer 3 (Output)
    z3 = np.dot(a2, w3) + b3
    probs = softmax(z3)

    return probs, a1, a2, z1, z2


# ============================================================================
# TRAINING
# ============================================================================

def train_mlp(
    X: np.ndarray,
    y: np.ndarray,
    output_size: int,
    config: TrainingConfig | None = None,
    sample_weights: np.ndarray | None = None,
    validation_data: tuple[np.ndarray, np.ndarray] | None = None,
    rng: np.random.Generator | None = None,
) -> WeightTuple:
    """
    Train 3-layer MLP using gradient descent.
    """

    cfg = config or TrainingConfig()

    # ========================================================================
    # WEIGHT INITIALIZATION (He initialization for ReLU)
    # ========================================================================

    input_dim = X.shape[1]
    layer1_size = MLP_LAYER1_SIZE
    layer2_size = MLP_LAYER2_SIZE

    rng = rng or np.random.default_rng()

    # He initialization: scale = sqrt(2 / fan_in)
    scale1 = np.sqrt(2.0 / input_dim)
    w1 = rng.standard_normal((input_dim, layer1_size)).astype(np.float32) * scale1
    b1 = np.zeros(layer1_size, dtype=np.float32)

    scale2 = np.sqrt(2.0 / layer1_size)
    w2 = rng.standard_normal((layer1_size, layer2_size)).astype(np.float32) * scale2
    b2 = np.zeros(layer2_size, dtype=np.float32)

    scale3 = np.sqrt(2.0 / layer2_size)
    w3 = rng.standard_normal((layer2_size, output_size)).astype(np.float32) * scale3
    b3 = np.zeros(output_size, dtype=np.float32)

    # ========================================================================
    # TRAINING SETUP
    # ========================================================================

    num_samples = X.shape[0]
    keep_prob = 1.0 - cfg.dropout_rate
    use_dropout = keep_prob < 1.0

    # Sample weights
    train_weights = None
    train_weight_sum = float(num_samples)
    if sample_weights is not None:
        train_weights = sample_weights
        train_weight_sum = float(np.sum(sample_weights))

    # Validation
    validation_X, validation_y = None, None
    if validation_data is not None:
        validation_X, validation_y = validation_data

    # Early stopping
    best_loss = math.inf
    best_weights = (w1.copy(), b1.copy(), w2.copy(), b2.copy(), w3.copy(), b3.copy())
    epochs_without_improvement = 0

    # ========================================================================
    # TRAINING LOOP
    # ========================================================================

    for epoch in range(cfg.epochs):

        # 1. Generate dropout masks
        dropout_mask1, dropout_mask2 = None, None
        if use_dropout:
            mask1 = (rng.random((num_samples, layer1_size)) < keep_prob).astype(np.float32)
            mask2 = (rng.random((num_samples, layer2_size)) < keep_prob).astype(np.float32)
            if keep_prob > 0:
                mask1 /= keep_prob
                mask2 /= keep_prob
            dropout_mask1, dropout_mask2 = mask1, mask2

        # 2. Forward pass
        probs, a1, a2, z1, z2 = _forward_mlp(
            X, w1, b1, w2, b2, w3, b3,
            dropout_mask1, dropout_mask2
        )

        # 3. Compute loss
        p = np.clip(probs[np.arange(num_samples), y], LOSS_EPSILON, 1.0 - LOSS_EPSILON)
        log_probs = -np.log(p)

        if train_weights is not None:
            loss = float(np.sum(log_probs * train_weights) / train_weight_sum)
        else:
            loss = float(np.mean(log_probs))

        # 4. Validation loss
        validation_loss = None
        if validation_X is not None and validation_y is not None:
            val_probs, _, _, _, _ = _forward_mlp(
                validation_X, w1, b1, w2, b2, w3, b3
            )
            v = np.clip(
                val_probs[np.arange(validation_y.shape[0]), validation_y],
                LOSS_EPSILON, 1.0 - LOSS_EPSILON
            )
            validation_loss = float(np.mean(-np.log(v)))

        # 5. Logging
        monitor_loss = validation_loss if validation_loss is not None else loss
        if epoch % max(1, cfg.epochs // 10) == 0:
            msg = f"Epoch {epoch+1}/{cfg.epochs} - Loss: {loss:.4f}"
            if validation_loss is not None:
                msg += f" - Val Loss: {validation_loss:.4f}"
            print(msg)

        # 6. Early stopping
        if monitor_loss < best_loss - cfg.early_stopping_min_delta:
            best_loss = monitor_loss
            best_weights = (w1.copy(), b1.copy(), w2.copy(), b2.copy(), w3.copy(), b3.copy())
            epochs_without_improvement = 0
        else:
            if cfg.early_stopping_patience:
                epochs_without_improvement += 1
                if epochs_without_improvement >= cfg.early_stopping_patience:
                    print(f"Early stopping at epoch {epoch+1}")
                    break

        # ====================================================================
        # 7. BACKPROPAGATION
        # ====================================================================

        # Output gradient
        dz3 = probs.copy()
        dz3[np.arange(num_samples), y] -= 1
        if train_weights is not None:
            dz3 *= (train_weights / train_weight_sum)[:, None]
        else:
            dz3 /= num_samples

        # Layer 3 gradients
        dw3 = np.dot(a2.T, dz3)
        db3 = np.sum(dz3, axis=0)

        # Layer 2 gradients
        da2 = np.dot(dz3, w3.T)
        if dropout_mask2 is not None:
            da2 *= dropout_mask2
        dz2 = da2 * relu_derivative(z2)
        dw2 = np.dot(a1.T, dz2)
        db2 = np.sum(dz2, axis=0)

        # Layer 1 gradients
        da1 = np.dot(dz2, w2.T)
        if dropout_mask1 is not None:
            da1 *= dropout_mask1
        dz1 = da1 * relu_derivative(z1)
        dw1 = np.dot(X.T, dz1)
        db1 = np.sum(dz1, axis=0)

        # ====================================================================
        # 8. GRADIENT DESCENT UPDATE
        # ====================================================================

        w1 -= cfg.learning_rate * dw1
        b1 -= cfg.learning_rate * db1
        w2 -= cfg.learning_rate * dw2
        b2 -= cfg.learning_rate * db2
        w3 -= cfg.learning_rate * dw3
        b3 -= cfg.learning_rate * db3

    return best_weights


def compute_accuracy(
    X: np.ndarray,
    y: np.ndarray,
    weights: WeightTuple
) -> float:
    """Compute classification accuracy."""
    if X.size == 0 or y.size == 0:
        return 0.0

    w1, b1, w2, b2, w3, b3 = weights
    probs, _, _, _, _ = _forward_mlp(X, w1, b1, w2, b2, w3, b3)
    preds = np.argmax(probs, axis=1)
    return float(np.mean(preds == y))


def test_mlp():
    """Test MLP architecture."""

    print("Testing 3-Layer MLP...")

    # Small dataset
    np.random.seed(42)
    X = np.random.randn(50, WINDOW_FEATURE_SIZE).astype(np.float32)
    y = np.random.randint(0, 3, size=50)

    # Test 1: Training
    config = TrainingConfig(epochs=20, learning_rate=0.01, dropout_rate=0.0)
    weights = train_mlp(X, y, output_size=3, config=config)

    w1, b1, w2, b2, w3, b3 = weights
    assert w1.shape == (WINDOW_FEATURE_SIZE, MLP_LAYER1_SIZE)
    assert w2.shape == (MLP_LAYER1_SIZE, MLP_LAYER2_SIZE)
    assert w3.shape == (MLP_LAYER2_SIZE, 3)
    print("  ✓ Weight shapes correct")

    # Test 2: Accuracy
    acc = compute_accuracy(X, y, weights)
    assert acc > 0.3  # Should learn something
    print(f"  ✓ Training works (accuracy: {acc:.2%})")

    print("All tests passed! ✓\n")

if __name__ == "__main__":
    test_mlp()
