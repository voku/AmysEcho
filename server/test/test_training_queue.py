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
    env.setdefault('API_TOKEN', 'testtoken')
    env.setdefault('PORT', PORT)
    proc = subprocess.Popen(
        ['npx', 'ts-node', 'src/server.ts'],
        cwd=SERVER_DIR,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    for _ in range(20):
        try:
            urllib.request.urlopen(f'http://localhost:{PORT}/')
            break
        except Exception:
            time.sleep(0.5)
    return proc


def stop_server(proc):
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


def post_correction():
    url = f'http://localhost:{PORT}/api/corrections'
    payload = json.dumps({"gesture": "wave"}).encode('utf-8')
    headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer testtoken',
    }
    req = urllib.request.Request(url, data=payload, headers=headers)
    with urllib.request.urlopen(req) as resp:
        return resp.getcode()


def load_training_count():
    with open(DB_PATH) as f:
        data = json.load(f)
    return len(data.get('gestureTrainingData', []))


def test_training_queue_increment():
    original = open(DB_PATH).read()
    proc = start_server()
    try:
        status = post_correction()
        assert status == 202
        # Ensure the correction was logged
        count = load_training_count()
        assert count >= 1
    finally:
        stop_server(proc)
        with open(DB_PATH, 'w') as f:
            f.write(original)

