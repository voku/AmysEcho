"""Direct episodic-sampling tests for sparse MLP training."""

from __future__ import annotations

import numpy as np
import pytest
from train_mlp_test_utils import module


@pytest.mark.parametrize("rng_factory", [np.random.RandomState, np.random.default_rng])
def test_episodic_indices_are_reproducible_with_supported_rngs(rng_factory):
    y = np.array([0, 0, 0, 1, 1, 1, 2, 2, 2], dtype=np.int64)
    first = module.build_episodic_indices(
        y,
        n_way=2,
        k_shot=1,
        queries_per_class=1,
        num_episodes=3,
        rng=rng_factory(10),
    )
    second = module.build_episodic_indices(
        y,
        n_way=2,
        k_shot=1,
        queries_per_class=1,
        num_episodes=3,
        rng=rng_factory(10),
    )

    np.testing.assert_array_equal(first, second)
    assert first.shape == (12,)
    assert set(y[first]).issubset({0, 1, 2})


def test_episodic_indices_replace_only_for_under_supported_classes():
    y = np.array([0, 0, 0, 1], dtype=np.int64)
    selected = module.build_episodic_indices(
        y,
        n_way=2,
        k_shot=2,
        queries_per_class=1,
        num_episodes=1,
        rng=np.random.RandomState(11),
    )

    assert selected.shape == (6,)
    assert np.count_nonzero(selected == 3) > 1
    assert len(set(selected[y[selected] == 0].tolist())) == 3
