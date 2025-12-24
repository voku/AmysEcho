import numpy as np
from src.amyserver_tools.train_mlp import _max_l1, _normalize, augment_landmarks


def test_normalize_one_hand() -> None:
    hand = [[0.2, 0.3, 0.1] for _ in range(21)]
    hand[12] = [0.4, 0.3, 0.3]
    res = _normalize(hand)
    assert res is not None
    arr = res.reshape(42, 3)
    assert np.allclose(arr[0], [0, 0, 0])
    # [0.4-0.2, 0.3-0.3, 0.3-0.1] = [0.2, 0, 0.2]
    # L1 max dist = 0.2+0+0.2 = 0.4
    # [0.2/0.4, 0, 0.2/0.4] = [0.5, 0, 0.5]
    # Scaled by 3.0 priority factor = [1.5, 0, 1.5]
    assert np.allclose(arr[12], [1.5, 0, 1.5])
    assert np.allclose(arr[21:], 0)


def test_normalize_two_hands() -> None:
    left = [[float(i), 0.1, 0.1] for i in range(21)]
    right = [[float(i), 0.1, 0.1] for i in range(21, 42)]
    res = _normalize(left + right)
    assert res is not None
    assert not np.allclose(res[63:], 0)
def test_augment_preserves_center_and_scale_two_hands() -> None:
    rng = np.random.default_rng(42)
    # Construct synthetic two-hand sample with varying coordinates.
    raw = [[i * 0.01 + 0.2, ((-1) ** i) * 0.02, 0.05 * (i % 3)] for i in range(42)]
    normalized = _normalize(raw)
    assert normalized is not None

    augmented = augment_landmarks(normalized, rng=rng)
    arr = augmented.reshape(42, 3)

    np.testing.assert_allclose(arr[0], [0.0, 0.0, 0.0], atol=1e-6)
    np.testing.assert_allclose(arr[21], [0.0, 0.0, 0.0], atol=1e-6)
    assert np.isclose(_max_l1(arr[:21]), 3.0, atol=1e-6)
    assert np.isclose(_max_l1(arr[21:]), 3.0, atol=1e-6)
    assert not np.allclose(augmented, normalized)


def test_augment_keeps_missing_hand_zero() -> None:
    rng = np.random.default_rng(123)
    left_hand = [[0.1 + 0.02 * i, 0.05, 0.01 * (i % 5)] for i in range(21)]
    normalized = _normalize(left_hand)
    assert normalized is not None

    augmented = augment_landmarks(normalized, rng=rng)
    arr = augmented.reshape(42, 3)

    np.testing.assert_allclose(arr[0], [0.0, 0.0, 0.0], atol=1e-6)
    assert np.isclose(_max_l1(arr[:21]), 3.0, atol=1e-6)
    np.testing.assert_allclose(arr[21:], 0.0, atol=1e-6)


def test_augment_noop_with_zero_noise() -> None:
    raw = [[0.05 * i, 0.02 * (i % 3), 0.01 * (i % 2)] for i in range(21)]
    normalized = _normalize(raw)
    assert normalized is not None

    rng = np.random.default_rng(7)
    augmented = augment_landmarks(
        normalized,
        rng=rng,
        jitter_std=0.0,
        max_rotation_degrees=0.0,
    )

    np.testing.assert_allclose(augmented, normalized, atol=1e-7)


def test_augment_output_stable_under_normalize() -> None:
    raw = [[0.03 * i, (-0.01) * (i % 4), 0.02 * ((i + 1) % 3)] for i in range(42)]
    normalized = _normalize(raw)
    assert normalized is not None

    rng = np.random.default_rng(314159)
    augmented = augment_landmarks(normalized, rng=rng)

    renormalized = _normalize(augmented.tolist())
    assert renormalized is not None

    np.testing.assert_allclose(
        augmented.reshape(42, 3),
        renormalized.reshape(42, 3),
        atol=1e-6,
    )
