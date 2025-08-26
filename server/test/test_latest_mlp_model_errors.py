import os
import subprocess
import time
import urllib.request
import urllib.error
import shutil
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parents[1]
PORT = "5057"


def start_server():
    env = os.environ.copy()
    env.setdefault("API_TOKEN", "testtoken")
    env.setdefault("PORT", PORT)
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
    req = urllib.request.Request(
        f"http://localhost:{PORT}/model-version", headers=headers
    )
    while True:
        if proc.poll() is not None:
            raise RuntimeError("server failed to start")
        try:
            with urllib.request.urlopen(req) as resp:
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


def test_latest_mlp_model_requires_authorization():
    proc = start_server()
    try:
        url = f"http://localhost:{PORT}/latest-mlp-model?profileId=p1"
        headers = {"Authorization": "Bearer testtoken"}
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req) as resp:
                status = resp.getcode()
        except urllib.error.HTTPError as e:
            status = e.code
        assert status == 403
    finally:
        stop_server(proc)


def test_latest_mlp_model_returns_404_when_missing():
    data_dir = SERVER_DIR / "data"
    if data_dir.exists():
        shutil.rmtree(data_dir)
    proc = start_server()
    try:
        url = f"http://localhost:{PORT}/latest-mlp-model"
        headers = {"Authorization": "Bearer testtoken"}
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req) as resp:
                status = resp.getcode()
        except urllib.error.HTTPError as e:
            status = e.code
        assert status == 404
    finally:
        stop_server(proc)
        if data_dir.exists():
            shutil.rmtree(data_dir)
