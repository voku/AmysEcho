import time
import urllib.request
import urllib.error
import subprocess
import os
import json
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pytest

from conftest import create_access_token

SERVER_DIR = Path(__file__).resolve().parents[1]
PORT = "5056"


def _load_default_labels() -> list[str]:
    labels_path = SERVER_DIR / "data" / "config" / "defaultBaselineLabels.json"
    try:
        with labels_path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except FileNotFoundError as error:
        labels_path.parent.mkdir(parents=True, exist_ok=True)
        labels_path.write_text(json.dumps(DEFAULT_LABEL_FALLBACK), encoding="utf-8")
        payload = list(DEFAULT_LABEL_FALLBACK)
    if not isinstance(payload, list):
        raise TypeError("defaultBaselineLabels.json must contain a list of strings")
    return [str(label) for label in payload]


# The JSON asset is the single source of truth for baseline gestures.
# Keep loaders in App and Server in sync if the structure changes.
DEFAULT_LABEL_FALLBACK = [
    "alle",
    "blau",
    "essen",
    "fertig",
    "gelb",
    "gruen",
    "nochmal",
    "rot",
    "satt",
    "schwester",
    "spielen",
    "trinken",
]

DEFAULT_BASELINE_LABELS = _load_default_labels()
BASELINE_MODEL_PATH = (SERVER_DIR / "data" / "amy_model.npz").resolve()


def _parse_timestamp(value: Any) -> datetime:
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc)
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def start_server():
    env = os.environ.copy()
    env.setdefault("JWT_SECRET", "test-jwt-secret")
    env.setdefault("JWT_REFRESH_SECRET", "test-refresh-secret")
    env.setdefault("PORT", PORT)
    # Run the real training script but keep epochs low for test speed
    env.setdefault("MLP_SCRIPT", "src/amyserver_tools/train_mlp.py")
    env.setdefault("MLP_EPOCHS", "5")
    data_dir = SERVER_DIR / "data"
    if data_dir.exists():
        shutil.rmtree(data_dir)
    config_dir = data_dir / "config"
    config_dir.mkdir(parents=True, exist_ok=True)
    (config_dir / "defaultBaselineLabels.json").write_text(
        json.dumps(DEFAULT_BASELINE_LABELS),
        encoding="utf-8",
    )
    subprocess.run(
        ["npm", "run", "build"],
        cwd=SERVER_DIR,
        env=env,
        check=True,
        stdout=subprocess.DEVNULL,
    )
    proc = subprocess.Popen(
        ["node", "dist/server.js"],
        cwd=SERVER_DIR,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    access_token = create_access_token(env["JWT_SECRET"], user_id="train-tester")
    # wait for server up
    headers = {"Authorization": f"Bearer {access_token}"}
    req = urllib.request.Request(
        f"http://localhost:{PORT}/model-version", headers=headers
    )
    start = time.time()
    while True:
        if proc.poll() is not None:
            raise RuntimeError("server failed to start")
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                if resp.getcode() == 200:
                    break
        except Exception as err:
            if time.time() - start > 30:
                raise RuntimeError("server did not start") from err
            time.sleep(0.5)
    return proc, access_token


def stop_server(proc):
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


def wait_for_training_completion(job_id: str, access_token: str, *, timeout: float = 180.0):
    status_url = f"http://localhost:{PORT}/train-status/{job_id}"
    headers = {"Authorization": f"Bearer {access_token}"}
    start = time.time()
    while True:
        req = urllib.request.Request(status_url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            payload = json.loads(resp.read().decode())
        status = payload.get("status")
        if status in {"completed", "failed"}:
            return payload
        if time.time() - start > timeout:
            raise AssertionError(f"training job {job_id} did not finish in time")
        time.sleep(1)


def test_train_endpoint():
    proc, access_token = start_server()
    try:
        url = f"http://localhost:{PORT}/train-model"
        # vary landmark coordinates slightly so normalization succeeds
        landmarks_one_hand = [[i * 0.01, 0.1, 0.1] for i in range(21)]
        samples = [
            {
                "gestureDefinitionId": "g1",
                "profileId": "p1",
                "landmarkData": landmarks_one_hand,
            }
        ]
        data = json.dumps({"samples": samples}).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {access_token}",
        }
        req = urllib.request.Request(url, data=data, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            assert resp.getcode() == 202
            resp_data = json.loads(resp.read().decode())
            job_id = resp_data["jobId"]
            assert resp_data["status"] in ("running", "queued")
            assert resp_data.get("pollUrl") == f"/train-status/{job_id}"

        final_info = wait_for_training_completion(job_id, access_token)
        assert final_info.get("status") == "completed"
        assert "metrics" in final_info
        assert "accuracy" in final_info["metrics"]
        assert final_info.get("report", {}).get("global")
        report = final_info.get("report", {})
        assert report.get("global", {}).get("samples", 0) >= 1

        # verify MLP model files created
        npz = SERVER_DIR / "data" / "models" / "global" / "amy_model.npz"
        prof_npz = SERVER_DIR / "data" / "models" / "p1" / "amy_model.npz"
        assert npz.exists()
        assert prof_npz.exists()
        with np.load(npz, allow_pickle=False) as model:
            assert "labels" in model
            assert model["labels"][0] == "g1"

        # ensure MLP model downloadable
        mlp_req = urllib.request.Request(
            f"http://localhost:{PORT}/latest-mlp-model",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        with urllib.request.urlopen(mlp_req, timeout=10) as mlp_resp:
            assert mlp_resp.getcode() == 200
            buf = mlp_resp.read()
            assert len(buf) > 0

        mlp_prof_req = urllib.request.Request(
            f"http://localhost:{PORT}/latest-mlp-model?profileId=p1",
            headers={
                "Authorization": f"Bearer {access_token}",
                "x-profile-id": "p1",
            },
        )
        with urllib.request.urlopen(mlp_prof_req, timeout=10) as mlp_presp:
            assert mlp_presp.getcode() == 200
            buf = mlp_presp.read()
            assert len(buf) > 0
    finally:
        stop_server(proc)


def test_train_endpoint_without_baseline_file():
    # Stash the backup outside server/data so start_server() cleanup cannot remove it.
    tmp_backup_root = Path(tempfile.mkdtemp(prefix="baseline_bak_"))
    backup_path = tmp_backup_root / "amy_model.npz.bak"
    baseline_was_present = BASELINE_MODEL_PATH.exists()
    if baseline_was_present:
        if backup_path.exists():
            backup_path.unlink()
        backup_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(BASELINE_MODEL_PATH), str(backup_path))
    # We manipulate the on-disk artifact because the server runs in a separate
    # process and reads the actual filesystem path. Mocking would not affect the
    # child process, so we isolate by backing up and restoring the file.
    proc = None
    try:
        proc, access_token = start_server()
        url = f"http://localhost:{PORT}/train-model"
        payload = json.dumps({"samples": [], "trigger": "bundles"}).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {access_token}",
        }
        req = urllib.request.Request(url, data=payload, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            assert resp.getcode() == 202
            resp_data = json.loads(resp.read().decode())
            job_id = resp_data["jobId"]
            assert resp_data["status"] in ("running", "queued")

        final_info = wait_for_training_completion(job_id, access_token)
        assert final_info.get("status") == "completed"
        global_model = SERVER_DIR / "data" / "models" / "global" / "amy_model.npz"
        assert global_model.exists()
        with np.load(global_model, allow_pickle=False) as model:
            labels = model["labels"].tolist()
            counts = model["counts"].tolist()
        assert labels == DEFAULT_BASELINE_LABELS
        assert all(float(value) == 0.0 for value in counts)
    finally:
        if proc is not None:
            stop_server(proc)
        if baseline_was_present and backup_path.exists():
            BASELINE_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(backup_path), str(BASELINE_MODEL_PATH))
        elif not baseline_was_present and BASELINE_MODEL_PATH.exists():
            BASELINE_MODEL_PATH.unlink()
        shutil.rmtree(tmp_backup_root, ignore_errors=True)


def test_train_requests_are_serialized():
    proc, access_token = start_server()
    try:
        url = f"http://localhost:{PORT}/train-model"
        landmarks_one_hand = [[i * 0.01, 0.1, 0.1] for i in range(21)]
        samples = [
            {
                "gestureDefinitionId": "g1",
                "profileId": "p1",
                "landmarkData": landmarks_one_hand,
            }
        ]
        payload = json.dumps({"samples": samples}).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {access_token}",
        }

        first_req = urllib.request.Request(url, data=payload, headers=headers)
        with urllib.request.urlopen(first_req, timeout=10) as first_resp:
            assert first_resp.getcode() == 202
            first_data = json.loads(first_resp.read().decode())
        second_req = urllib.request.Request(url, data=payload, headers=headers)
        with urllib.request.urlopen(second_req, timeout=10) as second_resp:
            assert second_resp.getcode() == 202
            second_data = json.loads(second_resp.read().decode())

        job1 = first_data["jobId"]
        job2 = second_data["jobId"]
        assert first_data["status"] in ("running", "queued")
        assert second_data["status"] == "queued"

        final_first = wait_for_training_completion(job1, access_token)
        final_second = wait_for_training_completion(job2, access_token)

        assert final_first.get("status") == "completed"
        assert final_second.get("status") == "completed"
        assert final_first.get("endedAt") is not None
        assert final_second.get("startedAt") is not None

        assert _parse_timestamp(final_second["startedAt"]) >= _parse_timestamp(final_first["endedAt"])
    finally:
        stop_server(proc)


def test_train_model_rejects_out_of_range_landmarks():
    proc, access_token = start_server()
    try:
        url = f"http://localhost:{PORT}/train-model"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {access_token}",
        }

        invalid_landmark_cases = [
            [[-0.1, 0.5, 0.0]] * 21,  # x < 0
            [[1.1, 0.5, 0.0]] * 21,   # x > 1
            [[0.5, -0.1, 0.0]] * 21,  # y < 0
            [[0.5, 1.1, 0.0]] * 21,   # y > 1
        ]

        for invalid_landmarks in invalid_landmark_cases:
            invalid_payload = json.dumps(
                {
                    "samples": [
                        {
                            "gestureDefinitionId": "g1",
                            "landmarkData": invalid_landmarks,
                        }
                    ]
                }
            ).encode("utf-8")

            invalid_req = urllib.request.Request(
                url, data=invalid_payload, headers=headers
            )

            with pytest.raises(urllib.error.HTTPError) as excinfo:
                urllib.request.urlopen(invalid_req, timeout=10)

            assert excinfo.value.code == 400
    finally:
        stop_server(proc)
