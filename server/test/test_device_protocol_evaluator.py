from __future__ import annotations

import importlib.util
import json
import shutil
import sys
from pathlib import Path


def load_module():
    script_path = Path(__file__).resolve().parents[2] / "scripts" / "evaluate_device_protocol_results.py"
    spec = importlib.util.spec_from_file_location("device_protocol_evaluator", script_path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_device_protocol_evaluator_writes_go_summary(tmp_path: Path) -> None:
    module = load_module()
    fixture_dir = Path(__file__).resolve().parent / "fixtures" / "device-protocol-results"
    result_dir = tmp_path / "2026-04-10"
    shutil.copytree(fixture_dir, result_dir)

    summary = module.evaluate_result_dir(result_dir)
    module.write_outputs(result_dir, summary)

    assert summary["fleet_verdict"] == "GO"
    summary_json = json.loads((result_dir / "summary.json").read_text(encoding="utf-8"))
    assert summary_json["fleet_verdict"] == "GO"
    interpretation = (result_dir / "apr-p0-4-gate-interpretation.md").read_text(encoding="utf-8")
    assert "Samsung Galaxy Tab A7 Lite" in interpretation
    assert "**GO**" in interpretation


def test_device_protocol_evaluator_marks_missing_p0_measurements_as_no_go(tmp_path: Path) -> None:
    module = load_module()
    fixture_dir = Path(__file__).resolve().parent / "fixtures" / "device-protocol-results"
    result_dir = tmp_path / "2026-04-11"
    shutil.copytree(fixture_dir, result_dir)

    sustained_summary = result_dir / "sustained_session_summary.csv"
    rows = sustained_summary.read_text(encoding="utf-8").splitlines()
    filtered = [row for row in rows if not row.startswith("Moto G Power")]
    sustained_summary.write_text("\n".join(filtered) + "\n", encoding="utf-8")

    summary = module.evaluate_result_dir(result_dir)
    assert summary["fleet_verdict"] == "NO-GO"
    moto = next(device for device in summary["devices"] if device["device"] == "Moto G Power (2023+)")
    assert moto["gates"]["G2"] == "Fail"
