import time
import urllib.request
import urllib.error
import subprocess
import os
import json
import shutil
from pathlib import Path
import numpy as np
import pytest

SERVER_DIR = Path(__file__).resolve().parents[1]
PORT = "5056"


def _load_baseline_metadata() -> tuple[list[str], Path]:
    result = subprocess.run(
        [
            "node",
            "--loader",
            "ts-node/esm",
            "src/amyserver_tools/export_constants.ts",
        ],
        cwd=SERVER_DIR,
        capture_output=True,
        text=True,
        check=True,
    )
    payload = json.loads(result.stdout)
    labels = list(payload.get("DEFAULT_BASELINE_LABELS", []))
    baseline = payload.get("BASELINE_MLP_MODEL_PATH")
    if not baseline:
        raise AssertionError("BASELINE_MLP_MODEL_PATH missing from export")
    return labels, Path(baseline).resolve()


DEFAULT_BASELINE_LABELS, BASELINE_MODEL_PATH = _load_baseline_metadata()


def start_server():
    env = os.environ.copy()
    env.setdefault("API_TOKEN", "testtoken")
    env.setdefault("PORT", PORT)
    # Run the real training script but keep epochs low for test speed
    env.setdefault("MLP_SCRIPT", "src/amyserver_tools/train_mlp.py")
    env.setdefault("MLP_EPOCHS", "5")
    data_dir = SERVER_DIR / "data"
    if data_dir.exists():
        shutil.rmtree(data_dir)
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
    # wait for server up
    headers = {"Authorization": "Bearer testtoken"}
    req = urllib.request.Request(
        f"http://localhost:{PORT}/model-version", headers=headers
    )
    start = time.time()
    while True:
        if proc.poll() is not None:
            raise RuntimeError("server failed to start")
        try:
            with urllib.request.urlopen(req) as resp:
                if resp.getcode() == 200:
                    break
        except Exception as err:
            if time.time() - start > 30:
                raise RuntimeError("server did not start") from err
            time.sleep(0.5)
    return proc


def stop_server(proc):
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


def wait_for_training_completion(job_id: str, *, timeout: float = 180.0):
    status_url = f"http://localhost:{PORT}/train-status/{job_id}"
    headers = {"Authorization": "Bearer testtoken"}
    start = time.time()
    while True:
        req = urllib.request.Request(status_url, headers=headers)
        with urllib.request.urlopen(req) as resp:
            payload = json.loads(resp.read().decode())
        status = payload.get("status")
        if status in {"completed", "failed"}:
            return payload
        if time.time() - start > timeout:
            raise AssertionError(f"training job {job_id} did not finish in time")
        time.sleep(1)


def test_train_endpoint():
    proc = start_server()
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
            "Authorization": "Bearer testtoken",
        }
        req = urllib.request.Request(url, data=data, headers=headers)
        with urllib.request.urlopen(req) as resp:
            assert resp.getcode() == 202
            resp_data = json.loads(resp.read().decode())
            job_id = resp_data["jobId"]
            assert resp_data["status"] in ("running", "queued")
            assert resp_data.get("pollUrl") == f"/train-status/{job_id}"

        final_info = wait_for_training_completion(job_id)
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
        with np.load(npz) as model:
            assert "labels" in model
            assert model["labels"][0] == "g1"

        # ensure MLP model downloadable
        mlp_req = urllib.request.Request(
            f"http://localhost:{PORT}/latest-mlp-model",
            headers={"Authorization": "Bearer testtoken"},
        )
        with urllib.request.urlopen(mlp_req) as mlp_resp:
            assert mlp_resp.getcode() == 200
            buf = mlp_resp.read()
            assert len(buf) > 0

        mlp_prof_req = urllib.request.Request(
            f"http://localhost:{PORT}/latest-mlp-model?profileId=p1",
            headers={
                "Authorization": "Bearer testtoken",
                "x-profile-id": "p1",
            },
        )
        with urllib.request.urlopen(mlp_prof_req) as mlp_presp:
            assert mlp_presp.getcode() == 200
            buf = mlp_presp.read()
            assert len(buf) > 0
    finally:
        stop_server(proc)


def test_train_endpoint_without_baseline_file():
    backup_path = BASELINE_MODEL_PATH.with_suffix(".npz.bak")
    baseline_was_present = BASELINE_MODEL_PATH.exists()
    if baseline_was_present:
        if backup_path.exists():
            backup_path.unlink()
        BASELINE_MODEL_PATH.rename(backup_path)
    proc = None
    try:
        proc = start_server()
        url = f"http://localhost:{PORT}/train-model"
        payload = json.dumps({"samples": [], "trigger": "bundles"}).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Authorization": "Bearer testtoken",
        }
        req = urllib.request.Request(url, data=payload, headers=headers)
        with urllib.request.urlopen(req) as resp:
            assert resp.getcode() == 202
            resp_data = json.loads(resp.read().decode())
            job_id = resp_data["jobId"]
            assert resp_data["status"] in ("running", "queued")

        final_info = wait_for_training_completion(job_id)
        assert final_info.get("status") == "completed"
        global_model = SERVER_DIR / "data" / "models" / "global" / "amy_model.npz"
        assert global_model.exists()
        with np.load(global_model) as model:
            labels = model["labels"].tolist()
            counts = model["counts"].tolist()
        assert labels == DEFAULT_BASELINE_LABELS
        assert all(float(value) == 0.0 for value in counts)
    finally:
        if proc is not None:
            stop_server(proc)
        if baseline_was_present and backup_path.exists():
            backup_path.rename(BASELINE_MODEL_PATH)
        elif not baseline_was_present and BASELINE_MODEL_PATH.exists():
            BASELINE_MODEL_PATH.unlink()


def test_train_requests_are_serialized():
    proc = start_server()
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
            "Authorization": "Bearer testtoken",
        }

        first_req = urllib.request.Request(url, data=payload, headers=headers)
        with urllib.request.urlopen(first_req) as first_resp:
            assert first_resp.getcode() == 202
            first_data = json.loads(first_resp.read().decode())
        second_req = urllib.request.Request(url, data=payload, headers=headers)
        with urllib.request.urlopen(second_req) as second_resp:
            assert second_resp.getcode() == 202
            second_data = json.loads(second_resp.read().decode())

        job1 = first_data["jobId"]
        job2 = second_data["jobId"]
        assert first_data["status"] in ("running", "queued")
        assert second_data["status"] == "queued"

        final_first = wait_for_training_completion(job1)
        final_second = wait_for_training_completion(job2)

        assert final_first.get("status") == "completed"
        assert final_second.get("status") == "completed"
        assert final_first.get("endedAt") is not None
        assert final_second.get("startedAt") is not None
        assert final_second["startedAt"] >= final_first["endedAt"]
    finally:
        stop_server(proc)


def test_train_model_rejects_out_of_range_landmarks(tmp_path):
    proc = start_server()
    try:
        url = f"http://localhost:{PORT}/train-model"
        headers = {
            "Content-Type": "application/json",
            "Authorization": "Bearer testtoken",
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
                urllib.request.urlopen(invalid_req)

            assert excinfo.value.code == 400
    finally:
        stop_server(proc)
