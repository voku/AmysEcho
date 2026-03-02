"""Unit tests for realistic DGS training cycle helpers."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


SCRIPT_PATH = Path("scripts/realistic_dgs_training_cycle.py").resolve()
spec = importlib.util.spec_from_file_location("realistic_dgs_training_cycle", SCRIPT_PATH)
assert spec is not None and spec.loader is not None
module = importlib.util.module_from_spec(spec)
sys.modules["realistic_dgs_training_cycle"] = module
spec.loader.exec_module(module)


def test_parse_epoch_schedule_accepts_positive_values() -> None:
    assert module.parse_epoch_schedule("20,40,80") == [20, 40, 80]


def test_parse_epoch_schedule_rejects_invalid_values() -> None:
    try:
        module.parse_epoch_schedule("10,0")
    except ValueError as exc:
        assert "positive integers" in str(exc)
    else:
        raise AssertionError("Expected ValueError for non-positive schedule")


def test_split_train_eval_is_reproducible_with_seed() -> None:
    files = [
        Path(f"/tmp/labela_var_{i}_landmarks.json") for i in range(6)
    ] + [
        Path(f"/tmp/labelb_var_{i}_landmarks.json") for i in range(6)
    ]

    train_a, eval_a, totals_a = module.split_train_eval(files, holdout_ratio=0.33, max_files_per_label=6, seed=42)
    train_b, eval_b, totals_b = module.split_train_eval(files, holdout_ratio=0.33, max_files_per_label=6, seed=42)

    assert train_a == train_b
    assert eval_a == eval_b
    assert totals_a == totals_b == {"labela": 6, "labelb": 6}


def test_resolve_epoch_for_attempt_uses_last_value_for_overflow() -> None:
    assert module.resolve_epoch_for_attempt([20, 40, 80], 0) == 20
    assert module.resolve_epoch_for_attempt([20, 40, 80], 2) == 80
    assert module.resolve_epoch_for_attempt([20, 40, 80], 4) == 80


def test_apply_workflow_preset_keeps_values_for_none() -> None:
    attempts, schedule, max_files, usable = module.apply_workflow_preset(
        "none", 4, [10, 20], 5, 0.5
    )
    assert attempts == 4
    assert schedule == [10, 20]
    assert max_files == 5
    assert usable == 0.5


def test_apply_workflow_preset_enforces_chat_validated_defaults() -> None:
    attempts, schedule, max_files, usable = module.apply_workflow_preset(
        "chat-validated-2026-03", 10, [999], 99, 0.9
    )
    assert attempts == 3
    assert schedule == [20, 40, 80]
    assert max_files == 3
    assert usable == 0.35
