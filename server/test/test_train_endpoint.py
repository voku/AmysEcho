import io
import json
import os
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from conftest import _get_free_port, create_access_token

SERVER_DIR = Path(__file__).resolve().parents[1]


def _make_auth_headers(access_token: str) -> dict[str, str]:
    """Helper to create Authorization headers with Bearer token."""
    return {"Authorization": f"Bearer {access_token}"}


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


def _load_default_labels() -> list[str]:
    labels_path = SERVER_DIR / "data" / "config" / "defaultBaselineLabels.json"
    try:
        with labels_path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except FileNotFoundError:
        labels_path.parent.mkdir(parents=True, exist_ok=True)
        labels_path.write_text(json.dumps(DEFAULT_LABEL_FALLBACK), encoding="utf-8")
        payload = list(DEFAULT_LABEL_FALLBACK)
    if not isinstance(payload, list):
        raise TypeError("defaultBaselineLabels.json must contain a list of strings")
    return [str(label) for label in payload]


DEFAULT_BASELINE_LABELS = _load_default_labels()


def _create_training_bundle_zip(label: str, profile_id: str | None = None) -> bytes:
    """Create a ZIP file containing a training bundle with proper structure."""
    # Create 30 frames with landmarks for a realistic training sample
    frames = []
    for f in range(30):
        frame = {
            "timestampMs": f * 33,
            "landmarks": [[(i + f) * 0.001, 0.1 + i * 0.001, 0.1] for i in range(42)],
            "poseLandmarks": [[0.5, 0.5 + f * 0.001, 0.5, 1.0] for _ in range(33)],
            "faceLandmarks": [[0.5, 0.5, 0.5] for _ in range(468)],
        }
        frames.append(frame)
    
    metadata: dict[str, Any] = {
        "label": label,
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "source": "test://train_endpoint",
    }
    # Only include profileId if it's a non-empty string
    if profile_id:
        metadata["profileId"] = profile_id
    
    landmarks_data = {"frames": frames}
    
    # Create ZIP in memory
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("bundle/metadata.json", json.dumps(metadata, indent=2))
        zf.writestr("bundle/landmarks.json", json.dumps(landmarks_data, indent=2))
        # Add fake still/clip files (minimal content)
        zf.writestr("bundle/still.jpg", b"fake-image-data")
        zf.writestr("bundle/clip.webm", b"fake-video-data")
    
    return buffer.getvalue()


def _parse_timestamp(value: Any) -> datetime:
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc)
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def start_server():
    env = os.environ.copy()
    env.setdefault("JWT_SECRET", "test-jwt-secret")
    env.setdefault("JWT_REFRESH_SECRET", "test-refresh-secret")
    env.setdefault("BACKUP_SECRET", "test-backup-secret-DO-NOT-USE-IN-PRODUCTION")
    port = str(_get_free_port())
    env["PORT"] = port
    # Run the real training script but keep epochs low for test speed
    env.setdefault("MLP_SCRIPT", "src/amyserver_tools/train_mlp.py")
    env.setdefault("MLP_EPOCHS", "5")
    env.setdefault("TRAINING_JOB_SLA_MS", "300000")
    data_dir = Path(tempfile.mkdtemp(prefix="amy-test-data-"))
    env["AMY_ECHO_DATA_DIR"] = str(data_dir)
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
        stderr=subprocess.PIPE,
        text=True,
    )
    access_token = create_access_token(env["JWT_SECRET"], user_id="train-tester")
    # wait for server up
    headers = _make_auth_headers(access_token)
    req = urllib.request.Request(
        f"http://localhost:{port}/model-version", headers=headers
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
    return proc, access_token, data_dir, port


def stop_server(proc):
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


def cleanup_data_dir(data_dir: Path | None) -> None:
    if data_dir is None:
        return
    shutil.rmtree(data_dir, ignore_errors=True)


def wait_for_training_completion(job_id: str, access_token: str, port: str, *, timeout: float = 180.0):
    status_url = f"http://localhost:{port}/api/v1/train-status/{job_id}"
    headers = _make_auth_headers(access_token)
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


def create_profile(base_url: str, access_token: str, profile_id: str, display_name: str):
    """Create a profile for testing profile-specific features."""
    url = f"{base_url}/api/v1/profiles"
    data = json.dumps({"id": profile_id, "displayName": display_name}).encode("utf-8")
    headers = {**_make_auth_headers(access_token), "Content-Type": "application/json"}
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=5) as resp:
        assert resp.getcode() == 201


def test_train_endpoint():
    proc = None
    data_dir: Path | None = None
    try:
        proc, access_token, data_dir, port = start_server()
        
        # Upload a training bundle via the sample-bundles endpoint
        bundle_zip = _create_training_bundle_zip("g1")
        upload_url = f"http://localhost:{port}/api/v1/dgs/sample-bundles"
        headers = {
            **_make_auth_headers(access_token),
            "Content-Type": "application/zip",
        }
        req = urllib.request.Request(upload_url, data=bundle_zip, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=30) as resp:
            assert resp.getcode() == 202
            resp_data = json.loads(resp.read().decode())
            assert resp_data.get("id")
            training_job = resp_data.get("trainingJob")
            assert training_job is not None
            job_id = training_job["jobId"]
            assert training_job["status"] in ("running", "queued")

        final_info = wait_for_training_completion(job_id, access_token, port)
        assert final_info.get("status") == "completed"
        assert "metrics" in final_info
        assert "accuracy" in final_info["metrics"]
        assert final_info.get("report", {}).get("global")
        report = final_info.get("report", {})
        assert report.get("global", {}).get("samples", 0) >= 1

        # verify MLP model files created
        npz = data_dir / "models" / "global" / "amy_model.npz"
        assert npz.exists()
        with np.load(npz, allow_pickle=False) as model:
            assert "labels" in model
            assert model["labels"][0] == "g1"

        # ensure MLP model downloadable
        mlp_req = urllib.request.Request(
            f"http://localhost:{port}/latest-mlp-model",
            headers=_make_auth_headers(access_token),
        )
        with urllib.request.urlopen(mlp_req, timeout=10) as mlp_resp:
            assert mlp_resp.getcode() == 200
            buf = mlp_resp.read()
            assert len(buf) > 0

        # Test profile-specific model access - create profile first
        test_profile_id = "11111111-1111-4111-8111-111111111111"
        create_profile(f"http://localhost:{port}", access_token, test_profile_id, "Test Profile")
        
        mlp_prof_req = urllib.request.Request(
            f"http://localhost:{port}/latest-mlp-model?profileId={test_profile_id}",
            headers={
                **_make_auth_headers(access_token),
                "x-profile-id": test_profile_id,
            },
        )
        with urllib.request.urlopen(mlp_prof_req, timeout=10) as mlp_presp:
            assert mlp_presp.getcode() == 200
            buf = mlp_presp.read()
    finally:
        if proc is not None:
            stop_server(proc)
        cleanup_data_dir(data_dir)


def test_train_endpoint_without_baseline_file():
    proc = None
    data_dir: Path | None = None
    try:
        proc, access_token, data_dir, port = start_server()
        url = f"http://localhost:{port}/train-model"
        payload = json.dumps({"samples": [], "trigger": "bundles"}).encode("utf-8")
        headers = {
            **_make_auth_headers(access_token),
            "Content-Type": "application/json",
        }
        req = urllib.request.Request(url, data=payload, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            assert resp.getcode() == 202
            resp_data = json.loads(resp.read().decode())
            job_id = resp_data["jobId"]
            assert resp_data["status"] in ("running", "queued")

        final_info = wait_for_training_completion(job_id, access_token, port)
        assert final_info.get("status") == "completed"
        global_model = data_dir / "models" / "global" / "amy_model.npz"
        assert global_model.exists()
        with np.load(global_model, allow_pickle=False) as model:
            labels = model["labels"].tolist()
            counts = model["counts"].tolist()
        assert labels == DEFAULT_BASELINE_LABELS
        assert all(float(value) == 0.0 for value in counts)
    finally:
        if proc is not None:
            stop_server(proc)
        cleanup_data_dir(data_dir)


def test_train_endpoint_returns_queue_metadata():
    proc = None
    data_dir: Path | None = None
    try:
        proc, access_token, data_dir, port = start_server()
        url = f"http://localhost:{port}/train-model"
        landmarks_sequence = []
        for f in range(30):
            frame = [[(i + f) * 0.001, 0.1, 0.1] for i in range(42)]
            landmarks_sequence.append({
                "timestampMs": f * 33,
                "landmarks": frame,
                "poseLandmarks": [[0.5, 0.5, 0.5, 1.0] for _ in range(33)],
                "faceLandmarks": [[0.5, 0.5, 0.5] for _ in range(468)],
            })
        samples = [
            {
                "signId": "g1",
                "profileId": "11111111-1111-4111-8111-111111111111",
                "landmarkData": landmarks_sequence,
            }
        ]
        data = json.dumps({"samples": samples}).encode("utf-8")
        headers = {
            **_make_auth_headers(access_token),
            "Content-Type": "application/json",
        }

        req_first = urllib.request.Request(url, data=data, headers=headers)
        with urllib.request.urlopen(req_first, timeout=10) as resp_first:
            assert resp_first.getcode() == 202
            first_payload = json.loads(resp_first.read().decode())
            first_job_id = first_payload["jobId"]

        req_second = urllib.request.Request(url, data=data, headers=headers)
        with urllib.request.urlopen(req_second, timeout=10) as resp_second:
            assert resp_second.getcode() == 202
            second_payload = json.loads(resp_second.read().decode())
            second_job_id = second_payload["jobId"]
            assert second_payload.get("queueDepth", 0) >= 1
            assert second_payload.get("retryAfterMs", 0) >= 1000
            retry_after = resp_second.headers.get("Retry-After")
            assert retry_after is not None

        wait_for_training_completion(first_job_id, access_token, port)
        wait_for_training_completion(second_job_id, access_token, port)
    finally:
        if proc is not None:
            stop_server(proc)
        cleanup_data_dir(data_dir)


def test_train_requests_are_serialized():
    proc = None
    data_dir: Path | None = None
    try:
        proc, access_token, data_dir, port = start_server()
        url = f"http://localhost:{port}/train-model"
        landmarks_sequence = []
        for f in range(30):
            frame = [[(i + f) * 0.001, 0.1, 0.1] for i in range(42)]
            landmarks_sequence.append({
                "timestampMs": f * 33,
                "landmarks": frame,
                "poseLandmarks": [[0.5, 0.5, 0.5, 1.0] for _ in range(33)],
                "faceLandmarks": [[0.5, 0.5, 0.5] for _ in range(468)],
            })
        samples = [
            {
                "signId": "g1",
                "profileId": "11111111-1111-4111-8111-111111111111",
                "landmarkData": landmarks_sequence,
            }
        ]
        payload = json.dumps({"samples": samples}).encode("utf-8")
        headers = {
            **_make_auth_headers(access_token),
            "Content-Type": "application/json",
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

        final_first = wait_for_training_completion(job1, access_token, port)
        final_second = wait_for_training_completion(job2, access_token, port)

        if final_first.get("status") == "failed":
            print("First Job Failed:", json.dumps(final_first, indent=2))
        if final_second.get("status") == "failed":
            print("Second Job Failed:", json.dumps(final_second, indent=2))

        assert final_first.get("status") == "completed"
        assert final_second.get("status") == "completed"
        assert final_first.get("endedAt") is not None
        assert final_second.get("startedAt") is not None

        assert _parse_timestamp(final_second["startedAt"]) >= _parse_timestamp(final_first["endedAt"])
    finally:
        if proc is not None:
            stop_server(proc)
        cleanup_data_dir(data_dir)


def test_train_model_rejects_out_of_range_landmarks():
    proc = None
    data_dir: Path | None = None
    try:
        proc, access_token, data_dir, port = start_server()
        url = f"http://localhost:{port}/train-model"
        headers = {
            **_make_auth_headers(access_token),
            "Content-Type": "application/json",
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
                            "signId": "g1",
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
        if proc is not None:
            stop_server(proc)
        cleanup_data_dir(data_dir)
