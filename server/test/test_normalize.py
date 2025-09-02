import numpy as np

from amyserver_tools.train_mlp import _normalize


def test_normalize_one_hand() -> None:
    hand = [[0.2, 0.3, 0.1] for _ in range(21)]
    hand[12] = [0.4, 0.3, 0.3]
    res = _normalize(hand)
    assert res is not None
    arr = res.reshape(42, 3)
    assert np.allclose(arr[0], [0, 0, 0])
    assert np.allclose(arr[12], [0.5, 0, 0.5])
    assert np.allclose(arr[21:], 0)


def test_normalize_two_hands() -> None:
    left = [[float(i), 0.1, 0.1] for i in range(21)]
    right = [[float(i), 0.1, 0.1] for i in range(21, 42)]
    res = _normalize(left + right)
    assert res is not None
    assert not np.allclose(res[63:], 0)
