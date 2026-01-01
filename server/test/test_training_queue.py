import json
import os
import subprocess
import time
import urllib.error
import urllib.request

from conftest import create_access_token

SERVER_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
PORT = "5055"
DB_PATH = os.path.join(SERVER_DIR, 'db.json')
ACCESS_TOKEN = ""


def start_server():
    env = os.environ.copy()
    env.setdefault("JWT_SECRET", "test-jwt-secret")
    env.setdefault("JWT_REFRESH_SECRET", "test-refresh-secret")
    env.setdefault("PORT", PORT)
    global ACCESS_TOKEN
    ACCESS_TOKEN = create_access_token(env["JWT_SECRET"], user_id="queue-tester")

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
    headers = {"Authorization": f"Bearer {ACCESS_TOKEN}"}
    req = urllib.request.Request(
        f"http://localhost:{PORT}/model-version", headers=headers
    )
    while True:
        if proc.poll() is not None:
            raise RuntimeError("server failed to start")
        try:
            with urllib.request.urlopen(req, timeout=2) as resp:
                if resp.getcode() == 200:
                    break
        except (urllib.error.URLError, ConnectionRefusedError, TimeoutError) as err:
            if time.time() - start > 30:
                raise RuntimeError("server did not start in time") from err
            time.sleep(0.5)
    return proc


def stop_server(proc):
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


def post_correction(payload):
    url = f'http://localhost:{PORT}/api/v1/corrections'
    body = json.dumps(payload).encode('utf-8')
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {ACCESS_TOKEN}',
    }
    req = urllib.request.Request(url, data=body, headers=headers)
    with urllib.request.urlopen(req, timeout=5) as resp:
        return resp.getcode()


def load_training_count():
    with open(DB_PATH) as f:
        data = json.load(f)
    return len(data.get('signTrainingData', []))


def test_training_queue_increment_single():
    original = open(DB_PATH).read()
    proc = start_server()
    try:
        before = load_training_count()
        status = post_correction({"sign": "wave"})
        assert status == 202
        after = load_training_count()
        assert after == before + 1
    finally:
        stop_server(proc)
        with open(DB_PATH, 'w') as f:
            f.write(original)


def test_training_queue_increment_object():
    original = open(DB_PATH).read()
    proc = start_server()
    try:
        before = load_training_count()
        status = post_correction({"sign": {"left": "wave", "right": "fist"}})
        assert status == 202
        after = load_training_count()
        assert after == before + 1
    finally:
        stop_server(proc)
        with open(DB_PATH, 'w') as f:
            f.write(original)

