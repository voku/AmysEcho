import hashlib
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

from conftest import TEST_JWT_REFRESH_SECRET, TEST_JWT_SECRET, _get_free_port, create_access_token

SERVER_DIR = Path(__file__).resolve().parents[1]
FIXTURE_PATH = SERVER_DIR / "test" / "fixtures" / "training_integration_fixture.json"
PROFILE_ID = "11111111-1111-4111-8111-111111111111"


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _request_json(url: str, headers: dict[str, str] | None = None) -> dict[str, Any]:
    if not url.startswith("http://127.0.0.1:"):
        raise ValueError(f"unsupported URL for integration test: {url}")
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=20) as response:  # nosec B310 - localhost test server only
        return json.loads(response.read().decode("utf-8"))


def _open_http_request(request: urllib.request.Request, timeout: int = 20):
    full_url = request.full_url
    if not full_url.startswith("http://127.0.0.1:"):
        raise ValueError(f"unsupported URL for integration test: {full_url}")
    return urllib.request.urlopen(request, timeout=timeout)  # nosec B310 - localhost test server only


def _sha256_file(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8192), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def _load_fixture() -> dict[str, Any]:
    with FIXTURE_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _expand_frames(seed_frames: list[dict[str, Any]], minimum_count: int = 30) -> list[dict[str, Any]]:
    frames: list[dict[str, Any]] = []
    frame_index = 0
    while len(frames) < minimum_count:
        base_frame = seed_frames[frame_index % len(seed_frames)]
        timestamp_ms = len(frames) * 33
        next_frame = dict(base_frame)
        next_frame["timestampMs"] = timestamp_ms
        frames.append(next_frame)
        frame_index += 1
    return frames


def _make_training_bundle(fixture: dict[str, Any]) -> bytes:
    label = fixture["label"]
    profile_id = fixture.get("profileId")
    frames = _expand_frames(fixture["frames"])
    metadata: dict[str, Any] = {
        "label": label,
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "source": "test://training_pipeline_fixture",
    }
    if isinstance(profile_id, str) and profile_id:
        metadata["profileId"] = profile_id

    payload = {"frames": frames}
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("bundle/metadata.json", json.dumps(metadata, indent=2))
        archive.writestr("bundle/landmarks.json", json.dumps(payload, indent=2))
        archive.writestr("bundle/still.jpg", b"fixture-image")
        archive.writestr("bundle/clip.webm", b"fixture-video")
    return buffer.getvalue()


def _wait_for_training_completion(base_url: str, token: str, job_id: str) -> dict[str, Any]:
    started = time.time()
    while True:
        status = _request_json(
            f"{base_url}/api/v1/train-status/{job_id}",
            headers=_auth_headers(token),
        )
        if status.get("status") in {"completed", "failed"}:
            return status
        if time.time() - started > 180:
            raise AssertionError(f"training job {job_id} did not finish in time")
        time.sleep(1)


def _start_server() -> tuple[subprocess.Popen, str, Path, str]:
    env = os.environ.copy()
    env.setdefault("JWT_SECRET", TEST_JWT_SECRET)
    env.setdefault("JWT_REFRESH_SECRET", TEST_JWT_REFRESH_SECRET)
    env.setdefault("BACKUP_SECRET", "test-backup-secret-DO-NOT-USE-IN-PRODUCTION")
    env.setdefault("NODE_ENV", "test")
    env.setdefault("MLP_SCRIPT", "src/amyserver_tools/train_mlp.py")
    env.setdefault("MLP_EPOCHS", "5")
    env.setdefault("TRAINING_JOB_SLA_MS", "300000")

    port = str(_get_free_port())
    env["PORT"] = port

    data_dir = Path(tempfile.mkdtemp(prefix="amy-training-pipeline-"))
    env["AMY_ECHO_DATA_DIR"] = str(data_dir)

    npm_executable = shutil.which("npm")
    node_executable = shutil.which("node")
    if npm_executable is None or node_executable is None:
        missing = "npm" if npm_executable is None else "node"
        raise RuntimeError(f"{missing} executable not found in PATH")

    process: subprocess.Popen | None = None
    try:
        if not (SERVER_DIR / "dist" / "server.js").exists():
            subprocess.run(
                [npm_executable, "run", "build"],
                cwd=SERVER_DIR,
                env=env,
                check=True,
                stdout=subprocess.DEVNULL,
            )

        process = subprocess.Popen(
            [node_executable, "dist/server.js"],
            cwd=SERVER_DIR,
            env=env,
            stdout=None,
            stderr=None,
        )

        token = create_access_token(env["JWT_SECRET"], user_id="training-fixture-tester")
        base_url = f"http://127.0.0.1:{port}"

        started = time.time()
        while True:
            if process.poll() is not None:
                raise RuntimeError("server failed to start")
            try:
                _request_json(f"{base_url}/api/v1/models/version", headers=_auth_headers(token))
                break
            except urllib.error.HTTPError as err:
                if time.time() - started > 30:
                    raise RuntimeError("server did not start") from err
                time.sleep(0.5)
            except urllib.error.URLError as err:
                if time.time() - started > 30:
                    raise RuntimeError("server did not start") from err
                time.sleep(0.5)

        profile_payload = json.dumps({"id": PROFILE_ID, "displayName": "Fixture Profile"}).encode("utf-8")
        create_profile_req = urllib.request.Request(
            f"{base_url}/api/v1/profiles",
            data=profile_payload,
            headers={**_auth_headers(token), "Content-Type": "application/json"},
            method="POST",
        )
        with _open_http_request(create_profile_req, timeout=10) as response:
            assert response.getcode() == 201

        return process, token, data_dir, base_url
    except Exception as err:
        if process is not None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
        shutil.rmtree(data_dir, ignore_errors=True)
        raise RuntimeError("failed to start integration test server") from err


def _stop_server(process: subprocess.Popen, data_dir: Path) -> None:
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
    shutil.rmtree(data_dir, ignore_errors=True)


def test_training_pipeline_with_fixture_dataset() -> None:
    fixture = _load_fixture()
    expected = fixture["expected"]

    process, token, data_dir, base_url = _start_server()
    try:
        readiness = _request_json(f"{base_url}/api/v1/health")
        assert readiness.get("status") == expected["readinessStatus"]
        assert readiness.get("checks", {}).get("trainingManifest", {}).get("status") == "ok"

        upload_request = urllib.request.Request(
            f"{base_url}/api/v1/dgs/sample-bundles",
            data=_make_training_bundle(fixture),
            headers={**_auth_headers(token), "Content-Type": "application/zip"},
            method="POST",
        )
        with _open_http_request(upload_request, timeout=30) as upload_response:
            assert upload_response.getcode() == 202
            upload_payload = json.loads(upload_response.read().decode("utf-8"))

        training_job = upload_payload.get("trainingJob")
        assert training_job is not None
        final_status = _wait_for_training_completion(base_url, token, training_job["jobId"])
        assert final_status.get("status") == expected["trainingStatus"]
        assert final_status.get("metrics", {}).get("samples", 0) >= expected["minimumSampleCount"]
        assert final_status.get("metrics", {}).get("fewShotPromoted") == expected["fewShotPromoted"]

        model_download_request = urllib.request.Request(
            f"{base_url}/api/v1/models/latest",
            headers=_auth_headers(token),
        )
        with _open_http_request(model_download_request, timeout=20) as model_response:
            body = model_response.read()
            assert len(body) > 0
            assert model_response.headers.get("X-Model-Contract-Status") == expected["artifactContractStatus"]
            training_version_header = model_response.headers.get("X-Training-Version")
            assert training_version_header is not None

        model_path = data_dir / "models" / "global" / "amy_model.npz"
        metadata_path = data_dir / "models" / "global" / "training_metadata.json"
        assert model_path.exists()
        assert metadata_path.exists()

        with metadata_path.open("r", encoding="utf-8") as handle:
            metadata = json.load(handle)
        assert metadata.get("version") == training_version_header
        assert metadata.get("artifact_contract", {}).get("feature_mode") is not None

        model_metadata_response = _request_json(
            f"{base_url}/api/v1/models/metadata",
            headers=_auth_headers(token),
        )
        assert isinstance(model_metadata_response.get("version"), str)
        assert isinstance(model_metadata_response.get("size"), int)
        assert isinstance(model_metadata_response.get("sha256"), str)
        assert model_metadata_response.get("size") == model_path.stat().st_size
        assert model_metadata_response.get("sha256") == _sha256_file(model_path)
    finally:
        _stop_server(process, data_dir)
