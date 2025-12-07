import os
import socket
import base64
import hashlib
import hmac
import json
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
ACCESS_TOKEN = ""


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


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def create_access_token(secret: str, *, user_id: str = "test-user") -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(time.time())
    payload = {
        "userId": user_id,
        "username": user_id,
        "role": "caregiver",
        "iat": now,
        "exp": now + 15 * 60,
    }
    signing_input = f"{_b64url(json.dumps(header, separators=(',', ':')).encode())}."
    signing_input += _b64url(json.dumps(payload, separators=(',', ':')).encode())
    signature = hmac.new(secret.encode(), signing_input.encode(), hashlib.sha256).digest()
    return f"{signing_input}.{_b64url(signature)}"


PORT = os.environ.get("PORT") or str(_get_free_port())
HOST = "127.0.0.1"
BASE_URL = f"http://{HOST}:{PORT}"


def start_server():
    ensure_baseline_model()

    env = os.environ.copy()
    env.setdefault("JWT_SECRET", "test-jwt-secret")
    env.setdefault("JWT_REFRESH_SECRET", "test-refresh-secret")
    env.setdefault("PORT", PORT)
    env.setdefault("HOST", HOST)
    global ACCESS_TOKEN
    ACCESS_TOKEN = create_access_token(env["JWT_SECRET"])
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
            req = urllib.request.Request(
                f"{BASE_URL}/model-version",
                headers={"Authorization": f"Bearer {ACCESS_TOKEN}"},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                if resp.getcode() == 200:
                    break
        except urllib.error.HTTPError as err:
            if time.time() - start > 30:
                raise RuntimeError("server did not start in time") from err
            time.sleep(0.5)
            continue
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
def auth_header():
    if not ACCESS_TOKEN:
        raise RuntimeError("access token not initialized")
    return {"Authorization": f"Bearer {ACCESS_TOKEN}"}


@pytest.fixture
def base_url():
    return BASE_URL
