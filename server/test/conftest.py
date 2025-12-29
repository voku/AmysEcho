import os
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import warnings

import jwt
import numpy as np
import pytest

SERVER_DIR = Path(__file__).resolve().parents[1]

warnings.filterwarnings(
    "ignore",
    message="The 'hidden_size' parameter is deprecated and ignored.*",
    category=DeprecationWarning,
)


def resolve_data_dir() -> Path:
    data_dir = os.environ.get("AMY_ECHO_DATA_DIR") or os.environ.get("AMY_DATA_DIR")
    return Path(data_dir) if data_dir else (SERVER_DIR / "data")


@pytest.fixture(scope="session", autouse=True)
def data_dir_env():
    original = os.environ.get("AMY_ECHO_DATA_DIR")
    temp_dir = Path(tempfile.mkdtemp(prefix="amy-echo-data-"))
    os.environ["AMY_ECHO_DATA_DIR"] = str(temp_dir)
    try:
        yield temp_dir
    finally:
        if original is not None:
            os.environ["AMY_ECHO_DATA_DIR"] = original
        else:
            os.environ.pop("AMY_ECHO_DATA_DIR", None)
        shutil.rmtree(temp_dir, ignore_errors=True)


DEFAULT_INPUT_SIZE = 126
DEFAULT_HIDDEN_SIZE = 256


@dataclass
class ServerContext:
    process: subprocess.Popen
    access_token: str
    base_url: str


def ensure_baseline_model() -> None:
    baseline_path = resolve_data_dir() / "amy_model.npz"
    if baseline_path.exists():
        return

    baseline_path.parent.mkdir(parents=True, exist_ok=True)

    labels = np.array(["baseline"], dtype="<U64")
    counts = np.zeros(labels.shape[0], dtype=np.float32)
    hidden = DEFAULT_HIDDEN_SIZE
    input_size = DEFAULT_INPUT_SIZE
    w1 = np.zeros((hidden, input_size), dtype=np.float32)
    b1 = np.zeros((hidden,), dtype=np.float32)
    w2 = np.zeros((labels.shape[0], hidden), dtype=np.float32)
    b2 = np.zeros((labels.shape[0],), dtype=np.float32)

    tmp_path = baseline_path.with_suffix(".tmp")
    with tmp_path.open("wb") as handle:
        np.savez(handle, labels=labels, counts=counts, w1=w1, b1=b1, w2=w2, b2=b2)
    tmp_path.replace(baseline_path)


def _get_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def create_access_token(secret: str, *, user_id: str = "test-user") -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "userId": user_id,
        "username": user_id,
        "role": "caregiver",
        "iat": now,
        "exp": now + timedelta(minutes=15),
    }
    token = jwt.encode(payload, secret, algorithm="HS256")
    return token.decode("utf-8") if isinstance(token, bytes) else token


PORT = os.environ.get("PORT") or str(_get_free_port())
HOST = "127.0.0.1"


def start_server() -> ServerContext:
    ensure_baseline_model()

    env = os.environ.copy()
    env.setdefault("JWT_SECRET", "test-jwt-secret")
    env.setdefault("JWT_REFRESH_SECRET", "test-refresh-secret")
    env.setdefault("PORT", PORT)
    env.setdefault("HOST", HOST)
    host = env.get("HOST", HOST)
    port = env.get("PORT", PORT)
    base_url = f"http://{host}:{port}"
    access_token = create_access_token(env["JWT_SECRET"])
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
                f"{base_url}/model-version",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                if resp.getcode() == 200:
                    break
        except urllib.error.HTTPError as err:
            if time.time() - start > 30:
                raise RuntimeError("server did not start in time") from err
            time.sleep(0.5)
            continue
        except (TimeoutError, urllib.error.URLError, ConnectionRefusedError):
            if time.time() - start > 30:
                raise RuntimeError("server did not start in time")
            time.sleep(0.5)
    return ServerContext(process=proc, access_token=access_token, base_url=base_url)


def stop_server(proc: subprocess.Popen):
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


@pytest.fixture
def running_server():
    context = start_server()
    try:
        yield context
    finally:
        stop_server(context.process)


@pytest.fixture
def auth_header(running_server):
    return {"Authorization": f"Bearer {running_server.access_token}"}


@pytest.fixture
def base_url(running_server):
    return running_server.base_url
