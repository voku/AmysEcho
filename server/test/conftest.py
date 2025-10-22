import os
import socket
import subprocess
import time
import urllib.request
import urllib.error
from pathlib import Path

import numpy as np
import pytest

SERVER_DIR = Path(__file__).resolve().parents[1]
BASELINE_PATH = SERVER_DIR / "data" / "amy_model.npz"
DEFAULT_INPUT_SIZE = 126
DEFAULT_HIDDEN_SIZE = 256


def ensure_baseline_model() -> None:
    if BASELINE_PATH.exists():
        return

    BASELINE_PATH.parent.mkdir(parents=True, exist_ok=True)

    labels = np.array(["baseline"], dtype="<U64")
    counts = np.zeros(labels.shape[0], dtype=np.float32)
    hidden = DEFAULT_HIDDEN_SIZE
    input_size = DEFAULT_INPUT_SIZE
    w1 = np.zeros((hidden, input_size), dtype=np.float32)
    b1 = np.zeros((hidden,), dtype=np.float32)
    w2 = np.zeros((labels.shape[0], hidden), dtype=np.float32)
    b2 = np.zeros((labels.shape[0],), dtype=np.float32)

    tmp_path = BASELINE_PATH.with_suffix(".tmp")
    with tmp_path.open("wb") as handle:
        np.savez(handle, labels=labels, counts=counts, w1=w1, b1=b1, w2=w2, b2=b2)
    tmp_path.replace(BASELINE_PATH)


def _get_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


PORT = os.environ.get("PORT") or str(_get_free_port())
HOST = "127.0.0.1"
BASE_URL = f"http://{HOST}:{PORT}"


def start_server():
    ensure_baseline_model()

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
    while True:
        if proc.poll() is not None:
            raise RuntimeError("server failed to start")
        try:
            with urllib.request.urlopen(f"{BASE_URL}/model-version", timeout=5) as resp:
                if resp.getcode() == 200:
                    break
        except urllib.error.HTTPError as err:
            if err.code == 401:
                break
        except (urllib.error.URLError, ConnectionRefusedError, socket.timeout):
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


@pytest.fixture
def running_server():
    proc = start_server()
    try:
        yield
    finally:
        stop_server(proc)


@pytest.fixture
def base_url():
    return BASE_URL
