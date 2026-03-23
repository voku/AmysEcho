from pathlib import Path

import pytest

from src.amyserver_tools.train_mlp_sweep import (
    SweepConfig,
    _build_command,
    _extract_score,
    _parse_float_list,
    _parse_int_list,
    _parse_training_report,
)


def test_parse_number_lists() -> None:
    assert _parse_int_list("10,20, 30") == [10, 20, 30]
    assert _parse_float_list("0.001, 0.01") == [0.001, 0.01]


def test_parse_training_report_from_last_json_line() -> None:
    stdout = "\n".join(
        [
            "debug line",
            '{"global": {"accuracy": 0.5, "f1_score": 0.4}}',
        ]
    )
    report = _parse_training_report(stdout)
    assert report["global"] == {"accuracy": 0.5, "f1_score": 0.4}


def test_parse_training_report_raises_when_no_json() -> None:
    with pytest.raises(ValueError, match="No JSON training report found"):
        _parse_training_report("no report here")


def test_extract_score_with_missing_training_section() -> None:
    with pytest.raises(ValueError, match="missing metrics section"):
        _extract_score({})


def test_extract_score_uses_global_metrics() -> None:
    report = {"global": {"accuracy": 0.75, "f1_score": 0.5}}
    assert _extract_score(report) == (0.75, 0.5)


def test_extract_score_raises_for_missing_metric() -> None:
    with pytest.raises(ValueError, match="missing required metric: f1_score"):
        _extract_score({"global": {"accuracy": 0.75}})


def test_extract_score_raises_for_invalid_metric() -> None:
    with pytest.raises(ValueError, match="invalid accuracy value"):
        _extract_score({"global": {"accuracy": "not-a-number", "f1_score": 0.1}})


def test_build_command_includes_expected_arguments() -> None:
    command = _build_command(
        train_script=Path("/tmp/train_mlp.py"),
        manifest=Path("/tmp/manifest.json"),
        data_dir=Path("/tmp/data"),
        output_dir=Path("/tmp/out"),
        config=SweepConfig(epochs=80, learning_rate=0.003, dropout=0.2, early_stopping=12),
        seed=1234,
        skip_examples=True,
    )
    assert command[0].endswith("python") or "python" in command[0]
    assert "--manifest" in command
    assert "--data-dir" in command
    assert "--output-dir" in command
    assert "--epochs" in command
    assert "--lr" in command
    assert "--dropout" in command
    assert "--early-stopping" in command
    assert "--seed" in command
    assert "--skip-examples" in command
