import os
import socket
import subprocess
import time
import urllib.request
import urllib.error
from pathlib import Path

import pytest

SERVER_DIR = Path(__file__).resolve().parents[1]


def _get_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
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
    while True:
        if proc.poll() is not None:
            raise RuntimeError("server failed to start")
        try:
            with urllib.request.urlopen(f"{BASE_URL}/health", timeout=5) as resp:
                if resp.getcode() == 200:
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
