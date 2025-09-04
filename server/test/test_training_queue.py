import os
import subprocess
import time
import json
import urllib.request
import urllib.error

SERVER_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
PORT = "5055"
DB_PATH = os.path.join(SERVER_DIR, 'db.json')


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
            with urllib.request.urlopen(req, timeout=2) as resp:
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


def post_correction(payload):
    url = f'http://localhost:{PORT}/api/corrections'
    body = json.dumps(payload).encode('utf-8')
    headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer testtoken',
    }
    req = urllib.request.Request(url, data=body, headers=headers)
    with urllib.request.urlopen(req, timeout=5) as resp:
        return resp.getcode()


def load_training_count():
    with open(DB_PATH) as f:
        data = json.load(f)
    return len(data.get('gestureTrainingData', []))


def test_training_queue_increment():
    original = open(DB_PATH).read()
    proc = start_server()
    try:
        before = load_training_count()
        status = post_correction({"gesture": ["wave", "fist"]})
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
        status = post_correction({"gesture": {"left": "wave", "right": "fist"}})
        assert status == 202
        after = load_training_count()
        assert after == before + 1
    finally:
        stop_server(proc)
        with open(DB_PATH, 'w') as f:
            f.write(original)

