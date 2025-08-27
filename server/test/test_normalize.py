import numpy as np

from tools.train_mlp import _normalize


def test_normalize_one_hand() -> None:
    left = [[float(i), 0.1, 0.1] for i in range(21)]
    res = _normalize(left)
    assert res is not None
    assert np.allclose(res[63:], 0)


def test_normalize_two_hands() -> None:
    left = [[float(i), 0.1, 0.1] for i in range(21)]
    right = [[float(i), 0.1, 0.1] for i in range(21, 42)]
    res = _normalize(left + right)
    assert res is not None
    assert not np.allclose(res[63:], 0)
