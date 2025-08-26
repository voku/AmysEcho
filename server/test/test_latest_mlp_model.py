import os
import socket
import subprocess
import time
import urllib.request
import urllib.error
import shutil
from pathlib import Path

import pytest

SERVER_DIR = Path(__file__).resolve().parents[1]


def _get_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("", 0))
        return s.getsockname()[1]


PORT = os.environ.get("PORT") or str(_get_free_port())
HOST = "127.0.0.1"
BASE_URL = f"http://{HOST}:{PORT}"

def start_server():
    env = os.environ.copy()
    env.setdefault("API_TOKEN", "testtoken")
    env.setdefault("PORT", PORT)
    env.setdefault("HOST", HOST)
    subprocess.run(
        ["npm", "run", "build"],
        cwd=SERVER_DIR,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=True,
    )
    proc = subprocess.Popen(
        ["node", "dist/server.js"],
        cwd=SERVER_DIR,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    start = time.time()
    headers = {"Authorization": "Bearer testtoken"}
    req = urllib.request.Request(f"{BASE_URL}/model-version", headers=headers)
    while True:
        if proc.poll() is not None:
            raise RuntimeError("server failed to start")
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                if resp.getcode() == 200:
                    break
        except Exception:
            if time.time() - start > 30:
                raise RuntimeError("server did not start in time")
            time.sleep(0.5)
    return proc

def stop_server(proc):
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()

def fetch_latest_mlp_model(profile_id=None, extra_headers=None):
    url = f"{BASE_URL}/latest-mlp-model"
    if profile_id:
        url += f"?profileId={profile_id}"
    headers = {"Authorization": "Bearer testtoken"}
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.getcode()
    except urllib.error.HTTPError as e:
        return e.code

@pytest.fixture
def running_server():
    proc = start_server()
    try:
        yield
    finally:
        stop_server(proc)

@pytest.fixture
def missing_data_dir():
    data_dir = SERVER_DIR / "data"
    backup_dir = None
    if data_dir.exists():
        backup_dir = data_dir.with_name(
            f"{data_dir.name}.bak.{int(time.time())}"
        )
        shutil.move(str(data_dir), str(backup_dir))
    yield data_dir
    if data_dir.exists():
        shutil.rmtree(data_dir)
    if backup_dir is not None and Path(backup_dir).exists():
        shutil.move(str(backup_dir), str(data_dir))

@pytest.fixture
def model_file():
    data_dir = SERVER_DIR / "data"
    backup_dir = None
    if data_dir.exists():
        backup_dir = data_dir.with_name(
            f"{data_dir.name}.bak.{int(time.time())}"
        )
        shutil.move(str(data_dir), str(backup_dir))
    data_dir.mkdir()
    model_path = data_dir / "dgs_model_p1.npz"
    model_path.write_bytes(b"placeholder")
    try:
        yield model_path
    finally:
        if data_dir.exists():
            shutil.rmtree(data_dir)
        if backup_dir is not None and Path(backup_dir).exists():
            shutil.move(str(backup_dir), str(data_dir))

def test_latest_mlp_model_requires_authorization(model_file, running_server):
    status = fetch_latest_mlp_model(profile_id="p1")
    assert status == 403

def test_latest_mlp_model_returns_404_when_missing(missing_data_dir, running_server):
    status = fetch_latest_mlp_model()
    assert status == 404

def test_latest_mlp_model_returns_200_for_authorized_owner(model_file, running_server):
    status = fetch_latest_mlp_model(
        profile_id="p1", extra_headers={"x-profile-id": "p1"}
    )
    assert status == 200
